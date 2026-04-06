/**
 * Whisper 语音识别服务 (渲染进程侧)
 * 使用 @huggingface/transformers 在 Chromium 中运行 ONNX Whisper 模型
 * 模型首次使用时自动从 HuggingFace 镜像下载并缓存到浏览器 Cache
 */

import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
  type AutomaticSpeechRecognitionOutput
} from '@huggingface/transformers'

/* 使用 HuggingFace 镜像源（解决国内 SSL/网络问题） */
env.remoteHost = 'https://hf-mirror.com'
env.allowLocalModels = false

/** Whisper 模型状态 */
export type WhisperStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 模型加载进度回调 */
export type ProgressCallback = (progress: {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}) => void

/** 默认使用 whisper-tiny, 体积小（~40MB）适合 Demo */
export const WHISPER_MODEL_ID = 'onnx-community/whisper-tiny'

/** 单例 pipeline 实例 */
let whisperPipeline: AutomaticSpeechRecognitionPipeline | null = null
let currentStatus: WhisperStatus = 'idle'

/** 最小有效音频时长（秒），低于此阈值不送入模型 */
const MIN_AUDIO_DURATION_SEC = 0.5
/** 静音阈值 — 绝对值低于此值视为静音 */
const SILENCE_THRESHOLD = 0.01

/**
 * 获取当前 Whisper 状态
 */
export function getWhisperStatus(): WhisperStatus {
  return currentStatus
}

/**
 * 检查 Whisper 模型是否已缓存到浏览器 Cache
 * 必须找到 .onnx 模型文件才算已缓存（避免只缓存了 config/tokenizer 的误判）
 */
export async function isWhisperCached(): Promise<boolean> {
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      const has = keys.some((req) => {
        const url = req.url
        const matchesModel =
          url.includes(WHISPER_MODEL_ID.replace('/', '%2F')) ||
          url.includes(WHISPER_MODEL_ID)
        return matchesModel && url.endsWith('.onnx')
      })
      if (has) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * 卸载 Whisper 模型 — 清除 Cache + 释放内存
 */
export async function deleteWhisperCache(): Promise<void> {
  if (whisperPipeline) {
    await whisperPipeline.dispose()
    whisperPipeline = null
    currentStatus = 'idle'
  }
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      for (const req of keys) {
        if (
          req.url.includes(WHISPER_MODEL_ID.replace('/', '%2F')) ||
          req.url.includes(WHISPER_MODEL_ID)
        ) {
          await cache.delete(req)
        }
      }
    }
  } catch (err) {
    console.warn('Failed to delete whisper cache:', err)
  }
}

/**
 * 初始化 Whisper 模型
 * 会触发模型下载（首次）和 ONNX session 创建
 * @param onProgress - 可选的进度回调（接收聚合后的总进度）
 * @param modelId - 可选的模型 ID，默认 whisper-tiny
 */
export async function initWhisper(
  onProgress?: ProgressCallback,
  modelId: string = WHISPER_MODEL_ID
): Promise<void> {
  if (whisperPipeline) return
  if (currentStatus === 'loading') return

  currentStatus = 'loading'

  /* 每个文件的独立进度，用于聚合 */
  const fileProgress = new Map<string, number>()
  /* 高水位线，防止进度倒退 */
  let highWatermark = 0

  try {
    /*
     * 禁止 WASM Worker 代理，避免 Electron 打包环境中 WebWorker 模式失败。
     * 与 translate.ts 一致：env.backends.onnx.wasm 第一次调用前可能未初始化，
     * 需确保对象存在后再赋值。
     */
    const onnxEnv = env.backends?.onnx
    if (onnxEnv) {
      if (!onnxEnv.wasm) {
        (onnxEnv as { wasm?: { proxy: boolean } }).wasm = { proxy: false }
      } else {
        onnxEnv.wasm.proxy = false
      }
    }

    whisperPipeline = await pipeline(
      'automatic-speech-recognition',
      modelId,
      {
        /* q4 量化：兼容性优于 q8，避免 ONNX Runtime NB-bits 报错 */
        dtype: 'q4',
        device: 'wasm',
        progress_callback: (p: Record<string, unknown>) => {
          if (!onProgress) return
          const status = p.status as string
          const file = (p.file as string) || 'unknown'

          /* 文件开始下载时注册，保证分母正确 */
          if (status === 'initiate' || status === 'download') {
            if (!fileProgress.has(file)) {
              fileProgress.set(file, 0)
            }
          }

          if (status === 'progress' && typeof p.progress === 'number') {
            /* 聚合多文件进度（高水位，不倒退） */
            fileProgress.set(file, p.progress as number)
            const denominator = fileProgress.size
            const values = Array.from(fileProgress.values())
            const avg = values.reduce((a, b) => a + b, 0) / denominator
            highWatermark = Math.max(highWatermark, avg)
            onProgress({ status, file, progress: highWatermark })
          } else {
            onProgress({ status, file, progress: p.progress as number | undefined })
          }
        }
      }
    )
    currentStatus = 'ready'
  } catch (err) {
    currentStatus = 'error'
    whisperPipeline = null
    /* 清除已缓存的部分文件，避免下次误报"已安装" */
    deleteWhisperCache().catch(() => { /* 忽略清理失败 */ })
    throw err
  }
}

/**
 * 检测音频是否为静音
 * 通过计算 RMS 振幅判断
 */
function isAudioSilent(audioData: Float32Array): boolean {
  let sumSquares = 0
  for (let i = 0; i < audioData.length; i++) {
    sumSquares += audioData[i] * audioData[i]
  }
  const rms = Math.sqrt(sumSquares / audioData.length)
  return rms < SILENCE_THRESHOLD
}

/**
 * UI 语言代码 → Whisper 语言名称映射
 * Whisper 使用语言名称（非 ISO 代码），如 'chinese' 而非 'zh'
 */
const LANG_CODE_TO_WHISPER: Record<string, string> = {
  'zh-CN': 'chinese',
  'en-US': 'english',
  'ja': 'japanese',
  'fr': 'french',
  'de': 'german',
  'ru': 'russian',
  'es': 'spanish',
  'it': 'italian'
}

/**
 * 将界面语言代码转为 Whisper 语言名称
 * @param uiLang - 如 'zh-CN', 'en-US'
 */
export function getWhisperLanguageHint(uiLang: string): string | undefined {
  return LANG_CODE_TO_WHISPER[uiLang]
}

/**
 * 转录音频数据为文字
 * @param audioData - 16kHz 单声道 PCM Float32Array
 * @param language  - 可选的 Whisper 语言提示（如 'chinese'），不传则自动检测
 * @returns 识别出的文字，空字符串表示无有效内容
 */
export async function transcribeAudio(audioData: Float32Array, language?: string): Promise<string> {
  /* 音频时长校验 (16kHz 采样率) */
  const durationSec = audioData.length / 16000
  if (durationSec < MIN_AUDIO_DURATION_SEC) {
    console.warn(`Audio too short: ${durationSec.toFixed(2)}s`)
    return ''
  }

  /* 静音检测 */
  if (isAudioSilent(audioData)) {
    console.warn('Audio is silent, skipping transcription')
    return ''
  }

  /* 如果模型未初始化，自动加载 */
  if (!whisperPipeline) {
    await initWhisper()
  }

  if (!whisperPipeline) {
    throw new Error('Whisper model failed to initialize')
  }

  const result = await whisperPipeline(audioData, {
    task: 'transcribe',
    /* 传入语言提示可显著提升识别准确率，尤其对中日韩等非英语语言 */
    language: language,
    return_timestamps: false
  }) as AutomaticSpeechRecognitionOutput

  return result.text.trim()
}

/**
 * 释放模型资源
 */
export async function disposeWhisper(): Promise<void> {
  if (whisperPipeline) {
    await whisperPipeline.dispose()
    whisperPipeline = null
    currentStatus = 'idle'
  }
}
