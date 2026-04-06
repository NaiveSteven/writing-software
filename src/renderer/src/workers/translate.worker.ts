/**
 * 翻译 Web Worker
 * 将 ONNX 推理隔离到独立线程，彻底避免阻塞渲染主线程
 * 与主线程通过结构化消息通信，每条请求携带唯一 id 用于匹配响应
 */
import { pipeline, env, type TranslationPipeline } from '@huggingface/transformers'

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

/** Worker 内部 pipeline 缓存（key: modelId） */
const pipelineCache = new Map<string, TranslationPipeline>()

/** 向主线程发送消息 */
function post(msg: WorkerResponse): void {
  self.postMessage(msg)
}

/**
 * 加载或复用已缓存的 pipeline
 * 支持多文件进度聚合（高水位线，防止进度倒退）
 */
async function ensurePipeline(
  modelId: string,
  onProgress?: (status: string, progress?: number) => void
): Promise<TranslationPipeline> {
  /* 已在内存中，直接返回 */
  const cached = pipelineCache.get(modelId)
  if (cached) return cached

  /* 多文件进度聚合 */
  const fileProgress = new Map<string, number>()
  let hwm = 0 /* 高水位线 */

  const pipe = await pipeline('translation', modelId, {
    /* q4 量化：性能/兼容性最优 */
    dtype: 'q4',
    device: 'wasm',
    progress_callback: (p: Record<string, unknown>) => {
      if (!onProgress) return
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
        onProgress(status, hwm)
      } else {
        onProgress(status, p.progress as number | undefined)
      }
    }
  }) as TranslationPipeline

  pipelineCache.set(modelId, pipe)
  return pipe
}

/** 消息分发（入口） */
self.onmessage = async (e: MessageEvent<WorkerRequest>): Promise<void> => {
  const msg = e.data

  if (msg.type === 'LOAD') {
    try {
      await ensurePipeline(msg.modelId, (status, progress) => {
        post({ type: 'PROGRESS', id: msg.id, modelId: msg.modelId, status, progress })
      })
      post({ type: 'LOAD_OK', id: msg.id })
    } catch (err) {
      post({ type: 'LOAD_ERR', id: msg.id, error: String(err) })
    }

  } else if (msg.type === 'TRANSLATE') {
    try {
      /* 若 pipeline 未加载则先加载（静默，无进度上报） */
      const pipe = await ensurePipeline(msg.modelId)
      const output = await pipe(msg.text) as Array<{ translation_text: string }>
      post({ type: 'TRANSLATE_OK', id: msg.id, result: output[0].translation_text })
    } catch (err) {
      post({ type: 'TRANSLATE_ERR', id: msg.id, error: String(err) })
    }

  } else if (msg.type === 'UNLOAD') {
    const pipe = pipelineCache.get(msg.modelId)
    if (pipe) {
      try { await pipe.dispose() } catch { /* ignore dispose errors */ }
      pipelineCache.delete(msg.modelId)
    }
    post({ type: 'UNLOAD_OK', id: msg.id })
  }
}
