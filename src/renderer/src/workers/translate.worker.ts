/**
 * 翻译 Web Worker
 * 将 ONNX 推理隔离到独立线程，避免阻塞渲染主线程。
 */
import { pipeline, env, type TranslationPipeline } from '@huggingface/transformers'

/* Worker 是独立上下文，需要单独设置镜像源和缓存策略。 */
env.remoteHost = 'https://hf-mirror.com'
env.allowLocalModels = false
env.allowRemoteModels = true

/* 已经在 Worker 内，关闭 onnxruntime-web 的二级 proxy。 */
const onnxEnv = env.backends?.onnx
if (onnxEnv) {
  if (!onnxEnv.wasm) {
    (onnxEnv as { wasm?: { proxy: boolean } }).wasm = { proxy: false }
  } else {
    onnxEnv.wasm.proxy = false
  }
}

/** MarianMT 长文本安全分块大小 */
const MAX_CHARS_PER_CHUNK = 400

/** Worker 接收的消息类型 */
type WorkerRequest =
  | { type: 'LOAD'; id: number; modelId: string }
  | { type: 'TRANSLATE'; id: number; text: string; modelId: string }
  | { type: 'UNLOAD'; id: number; modelId: string }

/** Worker 发出的消息类型 */
type WorkerResponse =
  | { type: 'PROGRESS'; id: number; modelId: string; status: string; progress?: number }
  | { type: 'LOAD_OK'; id: number }
  | { type: 'LOAD_ERR'; id: number; error: string }
  | { type: 'TRANSLATE_OK'; id: number; result: string }
  | { type: 'TRANSLATE_ERR'; id: number; error: string }
  | { type: 'UNLOAD_OK'; id: number }

/** Worker 内部 pipeline 缓存 */
const pipelineCache = new Map<string, TranslationPipeline>()

/** 向主线程发送消息 */
function post(message: WorkerResponse): void {
  self.postMessage(message)
}

/** 将长文本按句界拆分为不超过 MAX_CHARS_PER_CHUNK 的小段 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHARS_PER_CHUNK) return [text]

  const parts: string[] = []
  const sentenceRe = /[^.!?。！？\n]*[.!?。！？\n]+\s*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = sentenceRe.exec(text)) !== null) {
    parts.push(match[0])
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  const chunks: string[] = []
  let current = ''
  for (const part of parts) {
    if (part.length > MAX_CHARS_PER_CHUNK) {
      if (current.trim()) {
        chunks.push(current.trim())
        current = ''
      }
      for (let index = 0; index < part.length; index += MAX_CHARS_PER_CHUNK) {
        chunks.push(part.slice(index, index + MAX_CHARS_PER_CHUNK).trim())
      }
    } else if (current.length + part.length > MAX_CHARS_PER_CHUNK) {
      if (current.trim()) chunks.push(current.trim())
      current = part
    } else {
      current += part
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.filter((chunk) => chunk.length > 0)
}

/** 根据目标语言决定分块结果的拼接方式 */
function joinTranslatedChunks(chunks: string[], modelId: string): string {
  const tail = modelId.split('/').pop() ?? ''
  const targetLang = tail.split('-').pop() ?? ''
  const isCjk = ['zh', 'jap', 'ja', 'ko'].includes(targetLang)
  const separator = isCjk ? '' : ' '
  const joined = chunks.map((chunk) => chunk.trim()).filter(Boolean).join(separator)

  if (isCjk) {
    return joined.replace(/\s+/g, '').trim()
  }

  return joined.replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim()
}

/** 加载或复用已缓存的 pipeline */
async function ensurePipeline(
  modelId: string,
  onProgress?: (status: string, progress?: number) => void
): Promise<TranslationPipeline> {
  const cached = pipelineCache.get(modelId)
  if (cached) return cached

  const fileProgress = new Map<string, number>()
  let highWaterMark = 0

  const translationPipeline = await pipeline('translation', modelId, {
    /* int8 在稳定版 ort-web 下体积和兼容性最均衡。 */
    dtype: 'int8',
    device: 'wasm',
    progress_callback: (progressInfo: Record<string, unknown>) => {
      if (!onProgress) return

      const status = progressInfo.status as string
      const file = (progressInfo.file as string) || 'default'

      if (status === 'initiate' || status === 'download') {
        if (!fileProgress.has(file)) fileProgress.set(file, 0)
      }

      if (status === 'progress' && typeof progressInfo.progress === 'number') {
        fileProgress.set(file, progressInfo.progress as number)
        const denom = Math.max(fileProgress.size, 1)
        const average = Array.from(fileProgress.values()).reduce((sum, value) => sum + value, 0) / denom
        highWaterMark = Math.max(highWaterMark, average)
        onProgress(status, highWaterMark)
      } else {
        onProgress(status, progressInfo.progress as number | undefined)
      }
    }
  }) as TranslationPipeline

  pipelineCache.set(modelId, translationPipeline)
  return translationPipeline
}

/** 执行翻译推理 */
async function runTranslation(text: string, modelId: string): Promise<string> {
  const translationPipeline = await ensurePipeline(modelId)
  const chunks = splitTextIntoChunks(text)
  const results: string[] = []

  for (const chunk of chunks) {
    const output = await translationPipeline(chunk) as Array<{ translation_text: string }>
    results.push(output[0]?.translation_text ?? '')
  }

  return joinTranslatedChunks(results, modelId)
}

/** Worker 消息入口 */
self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const message = event.data

  if (message.type === 'LOAD') {
    try {
      await ensurePipeline(message.modelId, (status, progress) => {
        post({ type: 'PROGRESS', id: message.id, modelId: message.modelId, status, progress })
      })
      post({ type: 'LOAD_OK', id: message.id })
    } catch (error) {
      post({ type: 'LOAD_ERR', id: message.id, error: String(error) })
    }
    return
  }

  if (message.type === 'TRANSLATE') {
    try {
      const result = await runTranslation(message.text, message.modelId)
      post({ type: 'TRANSLATE_OK', id: message.id, result })
    } catch (error) {
      post({ type: 'TRANSLATE_ERR', id: message.id, error: String(error) })
    }
    return
  }

  if (message.type === 'UNLOAD') {
    const translationPipeline = pipelineCache.get(message.modelId)
    if (translationPipeline) {
      try {
        await translationPipeline.dispose()
      } catch {
        /* ignore dispose errors */
      }
      pipelineCache.delete(message.modelId)
    }
    post({ type: 'UNLOAD_OK', id: message.id })
  }
}