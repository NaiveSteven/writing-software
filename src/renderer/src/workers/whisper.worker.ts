/**
 * Whisper 语音识别 Web Worker
 * 将 ONNX Whisper 推理隔离到独立线程，彻底避免阻塞渲染主线程
 * 与主线程通过结构化消息通信，每条请求携带唯一 id 用于匹配响应
 */
import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
  type AutomaticSpeechRecognitionOutput
} from '@huggingface/transformers'

/* Worker 内重新配置镜像源（Worker 是独立 JS 上下文） */
env.remoteHost = 'https://hf-mirror.com'
env.allowLocalModels = false

/* 本身已在 Worker 线程，禁用 proxy 避免嵌套 Worker */
const onnxEnv = env.backends?.onnx
if (onnxEnv) {
  if (!onnxEnv.wasm) {
    (onnxEnv as { wasm?: { proxy: boolean } }).wasm = { proxy: false }
  } else {
    onnxEnv.wasm.proxy = false
  }
}

/** Worker 接收的消息类型 */
type WorkerRequest =
  | { type: 'LOAD'; id: number; modelId: string }
  | { type: 'TRANSCRIBE'; id: number; audio: Float32Array; language?: string }
  | { type: 'DISPOSE'; id: number }

/** Worker 发出的消息类型 */
type WorkerResponse =
  | { type: 'PROGRESS'; id: number; modelId: string; status: string; progress?: number }
  | { type: 'LOAD_OK'; id: number }
  | { type: 'LOAD_ERR'; id: number; error: string }
  | { type: 'TRANSCRIBE_OK'; id: number; text: string }
  | { type: 'TRANSCRIBE_ERR'; id: number; error: string }
  | { type: 'DISPOSE_OK'; id: number }

/** 语音识别 pipeline 单例 */
let whisperPipeline: AutomaticSpeechRecognitionPipeline | null = null
/** 已加载的模型 ID */
let loadedModelId: string | null = null

/** 向主线程发消息 */
function post(msg: WorkerResponse): void {
  self.postMessage(msg)
}

/** 最小有效音频时长（秒） */
const MIN_AUDIO_DURATION_SEC = 0.5

/** 静音 RMS 阈值 */
const SILENCE_THRESHOLD = 0.01

/** 最少输出 token 数，避免极短句被过早截断 */
const MIN_NEW_TOKENS = 32

/** 最多输出 token 数，限制短语音的解码时长 */
const MAX_NEW_TOKENS = 96

/** 每秒语音允许生成的 token 粗略上限 */
const TOKENS_PER_SECOND = 8

/** 判断音频是否全为静音 */
function isAudioSilent(audio: Float32Array): boolean {
  let sumSq = 0
  for (let i = 0; i < audio.length; i++) {
    sumSq += audio[i] * audio[i]
  }
  return Math.sqrt(sumSq / audio.length) < SILENCE_THRESHOLD
}

/** 为当前音频长度生成较保守的 Whisper 解码参数 */
function buildTranscribeOptions(audio: Float32Array, language?: string): {
  task: 'transcribe'
  language?: string
  return_timestamps: false
  max_new_tokens: number
} {
  const durationSec = audio.length / 16000
  const estimatedTokens = Math.ceil(durationSec * TOKENS_PER_SECOND)
  return {
    task: 'transcribe',
    language,
    return_timestamps: false,
    max_new_tokens: Math.max(MIN_NEW_TOKENS, Math.min(MAX_NEW_TOKENS, estimatedTokens))
  }
}

/**
 * 加载（或复用已缓存的）Whisper pipeline
 * 支持多文件进度聚合（高水位线防止倒退）
 */
async function ensurePipeline(
  modelId: string,
  reqId: number
): Promise<AutomaticSpeechRecognitionPipeline> {
  /* 已加载且是同一模型，直接复用 */
  if (whisperPipeline && loadedModelId === modelId) return whisperPipeline

  /* 释放旧 pipeline */
  if (whisperPipeline) {
    await whisperPipeline.dispose()
    whisperPipeline = null
    loadedModelId = null
  }

  /* 多文件进度聚合（高水位线防止倒退） */
  const fileProgress = new Map<string, number>()
  let hwm = 0

  whisperPipeline = await pipeline('automatic-speech-recognition', modelId, {
    dtype: 'q4',
    device: 'wasm',
    progress_callback: (p: Record<string, unknown>) => {
      const status = p.status as string
      const file = (p.file as string) || 'default'

      if (status === 'initiate' || status === 'download') {
        if (!fileProgress.has(file)) fileProgress.set(file, 0)
      }

      if (status === 'progress' && typeof p.progress === 'number') {
        fileProgress.set(file, p.progress as number)
        const denom = Math.max(fileProgress.size, 1)
        const avg = Array.from(fileProgress.values()).reduce((a, b) => a + b, 0) / denom
        hwm = Math.max(hwm, avg)
        post({ type: 'PROGRESS', id: reqId, modelId, status, progress: hwm })
      } else {
        post({ type: 'PROGRESS', id: reqId, modelId, status })
      }
    }
  })

  loadedModelId = modelId
  return whisperPipeline
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data

  if (msg.type === 'LOAD') {
    try {
      await ensurePipeline(msg.modelId, msg.id)
      post({ type: 'LOAD_OK', id: msg.id })
    } catch (err) {
      post({
        type: 'LOAD_ERR',
        id: msg.id,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  } else if (msg.type === 'TRANSCRIBE') {
    const { id, audio, language } = msg
    const durationSec = audio.length / 16000

    /* 过短或静音直接返回空字符串 */
    if (durationSec < MIN_AUDIO_DURATION_SEC || isAudioSilent(audio)) {
      post({ type: 'TRANSCRIBE_OK', id, text: '' })
      return
    }

    if (!whisperPipeline) {
      post({ type: 'TRANSCRIBE_ERR', id, error: 'Whisper pipeline not loaded' })
      return
    }

    try {
      const result = (await whisperPipeline(
        audio,
        buildTranscribeOptions(audio, language)
      )) as AutomaticSpeechRecognitionOutput
      post({ type: 'TRANSCRIBE_OK', id, text: result.text.trim() })
    } catch (err) {
      post({
        type: 'TRANSCRIBE_ERR',
        id,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  } else if (msg.type === 'DISPOSE') {
    if (whisperPipeline) {
      await whisperPipeline.dispose()
      whisperPipeline = null
      loadedModelId = null
    }
    post({ type: 'DISPOSE_OK', id: msg.id })
  }
}
