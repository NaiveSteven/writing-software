/**
 * Whisper 语音识别服务（渲染主线程侧）
 * 通过 Web Worker 代理 ONNX 推理，避免阻塞渲染线程
 * 渲染主线程仅负责 Cache API 检测和 Worker 消息调度
 */

import {
  DEFAULT_WHISPER_MODEL_ID,
  WHISPER_MODEL_ID,
  WHISPER_MODEL_OPTIONS,
  type WhisperModelId,
} from './whisper-models'

export {
  DEFAULT_WHISPER_MODEL_ID,
  WHISPER_MODEL_ID,
  WHISPER_MODEL_OPTIONS,
} from './whisper-models'
export type { WhisperModelId } from './whisper-models'

/** Whisper 模型状态 */
export type WhisperStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 模型加载进度回调 */
export type ProgressCallback = (progress: {
  status: string
  file?: string
  progress?: number
}) => void

/** Whisper 模型缓存状态 */
export interface WhisperModelStatusInfo {
  modelId: WhisperModelId
  cached: boolean
}

/* ============================================================
   Worker 消息协议类型定义
   ============================================================ */

/** 主线程 → Worker 的消息类型 */
type WorkerRequest =
  | { type: 'LOAD'; id: number; modelId: string }
  | { type: 'TRANSCRIBE'; id: number; audio: Float32Array; language?: string }
  | { type: 'DISPOSE'; id: number }

/** Worker → 主线程的消息类型 */
type WorkerResponse =
  | { type: 'PROGRESS'; id: number; modelId: string; status: string; progress?: number }
  | { type: 'LOAD_OK'; id: number }
  | { type: 'LOAD_ERR'; id: number; error: string }
  | { type: 'TRANSCRIBE_OK'; id: number; text: string }
  | { type: 'TRANSCRIBE_ERR'; id: number; error: string }
  | { type: 'DISPOSE_OK'; id: number }

/** 挂起请求回调结构 */
interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

/* ============================================================
   WhisperWorkerClient — 封装与 Worker 的通信
   ============================================================ */

/**
 * Whisper Worker 客户端
 * 管理 Worker 生命周期，将异步消息抽象为 Promise API
 */
class WhisperWorkerClient {
  private worker: Worker | null = null
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 1
  private _status: WhisperStatus = 'idle'
  private loadPromise: Promise<void> | null = null
  private loadedModelId: WhisperModelId | null = null
  private loadingModelId: WhisperModelId | null = null
  /** 当前进度回调（仅加载阶段有效） */
  private progressCallback: ProgressCallback | null = null

  /** 延迟初始化 Worker（避免不必要的资源消耗） */
  private getWorker(): Worker {
    if (this.worker) return this.worker
    this.worker = new Worker(
      new URL('../workers/whisper.worker', import.meta.url),
      { type: 'module' }
    )
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleMessage(e.data)
    this.worker.onerror = (e) => {
      this._status = 'error'
      this.loadingModelId = null
      this.loadedModelId = null
      console.error('[WhisperWorker] error:', e)
    }
    return this.worker
  }

  /** 处理 Worker 发来的所有消息 */
  private handleMessage(msg: WorkerResponse): void {
    /* PROGRESS 不对应具体 pending，直接转发给回调 */
    if (msg.type === 'PROGRESS') {
      this.progressCallback?.({ status: msg.status, progress: msg.progress })
      return
    }
    const req = this.pending.get(msg.id)
    if (!req) return
    this.pending.delete(msg.id)

    if (msg.type === 'LOAD_OK') {
      this._status = 'ready'
      this.loadedModelId = this.loadingModelId
      this.loadingModelId = null
      req.resolve(undefined)
    } else if (msg.type === 'LOAD_ERR') {
      this._status = 'error'
      this.loadingModelId = null
      req.reject(new Error(msg.error))
    } else if (msg.type === 'TRANSCRIBE_OK') {
      req.resolve(msg.text)
    } else if (msg.type === 'TRANSCRIBE_ERR') {
      req.reject(new Error(msg.error))
    } else if (msg.type === 'DISPOSE_OK') {
      this._status = 'idle'
      this.loadedModelId = null
      this.loadingModelId = null
      req.resolve(undefined)
    }
  }

  /** 当前状态 */
  getStatus(): WhisperStatus {
    return this._status
  }

  /** 当前已加载的模型 ID */
  getLoadedModelId(): WhisperModelId | null {
    return this.loadedModelId
  }

  /**
   * 加载 Whisper 模型（从缓存快速加载 / 首次下载）
   * 若已就绪则立即返回；若正在加载则复用同一个 Promise
   */
  async load(modelId: WhisperModelId, onProgress?: ProgressCallback): Promise<void> {
    if (this._status === 'ready' && this.loadedModelId === modelId) return

    if (this.loadPromise) {
      if (onProgress) this.progressCallback = onProgress
      if (this.loadingModelId === modelId) {
        return this.loadPromise
      }
      try {
        await this.loadPromise
      } catch {
        /* 旧模型加载失败后继续尝试当前目标模型 */
      }
    }

    if (this._status === 'ready' && this.loadedModelId && this.loadedModelId !== modelId) {
      await this.dispose()
    }

    this._status = 'loading'
    this.loadingModelId = modelId
    this.progressCallback = onProgress ?? null
    const id = this.nextId++
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve: () => resolve(), reject })
      this.getWorker().postMessage({ type: 'LOAD', id, modelId } satisfies WorkerRequest)
    }).finally(() => {
      this.loadPromise = null
      this.progressCallback = null
    })

    return this.loadPromise
  }

  /**
   * 转写音频（需先 load）
   * buffer 所有权通过 Transferable 零拷贝传入 Worker
   * 超过 30s 自动失败，避免过长等待
   */
  async transcribe(audio: Float32Array, language?: string): Promise<string> {
    const TIMEOUT_MS = 30_000
    const id = this.nextId++
    const transcribePromise = new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as string), reject })
      this.getWorker().postMessage(
        { type: 'TRANSCRIBE', id, audio, language } satisfies WorkerRequest,
        [audio.buffer]
      )
    })
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Transcription timeout (30s)'))
      }, TIMEOUT_MS)
    )
    return Promise.race([transcribePromise, timeoutPromise])
  }

  /**
   * 释放 Worker 内 pipeline 并终止 Worker 线程
   */
  async dispose(): Promise<void> {
    const worker = this.worker
    if (!worker) {
      this._status = 'idle'
      this.loadedModelId = null
      this.loadingModelId = null
      return
    }
    const id = this.nextId++
    return new Promise<void>((resolve) => {
      const cleanup = (): void => {
        worker.terminate()
        this.worker = null
        this._status = 'idle'
        this.loadedModelId = null
        this.loadingModelId = null
        this.progressCallback = null
        resolve()
      }
      this.pending.set(id, { resolve: cleanup, reject: cleanup })
      worker.postMessage({ type: 'DISPOSE', id } satisfies WorkerRequest)
    })
  }
}

/** 全局单例 Worker 客户端 */
const workerClient = new WhisperWorkerClient()

/* ============================================================
   公开 API（与原 whisper.ts 保持相同签名，调用方无需改动）
   ============================================================ */

/** 获取当前 Whisper 状态 */
export function getWhisperStatus(): WhisperStatus {
  return workerClient.getStatus()
}

/** 获取当前已加载到 Worker 的 Whisper 模型 ID */
export function getLoadedWhisperModelId(): WhisperModelId | null {
  return workerClient.getLoadedModelId()
}

/**
 * 初始化（加载）Whisper 模型
 * 已缓存时快速加载；未缓存时触发下载
 */
export async function initWhisper(
  onProgress?: ProgressCallback,
  modelId: WhisperModelId = DEFAULT_WHISPER_MODEL_ID
): Promise<void> {
  await workerClient.load(modelId, onProgress)
}

/**
 * 检查 Whisper 模型是否已缓存到浏览器 Cache
 * 必须找到 .onnx 文件才视为已缓存，防止只缓存 tokenizer 误判
 */
export async function isWhisperCached(modelId: WhisperModelId = DEFAULT_WHISPER_MODEL_ID): Promise<boolean> {
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      const has = keys.some((req) => {
        const url = req.url
        const matchesModel =
          url.includes(modelId.replace('/', '%2F')) ||
          url.includes(modelId)
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
 * 删除 Whisper 模型缓存并终止 Worker
 * 对应"卸载模型"操作
 */
export async function deleteWhisperCache(
  modelId: WhisperModelId = DEFAULT_WHISPER_MODEL_ID
): Promise<void> {
  if (workerClient.getLoadedModelId() === modelId) {
    await workerClient.dispose()
  }
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      for (const req of keys) {
        if (
          req.url.includes(modelId.replace('/', '%2F')) ||
          req.url.includes(modelId)
        ) {
          await cache.delete(req)
        }
      }
    }
  } catch (err) {
    console.warn('[WhisperService] Failed to delete cache:', err)
  }
}

/**
 * UI 语言代码 → Whisper 语言名称
 * Whisper 使用语言全名（如 'chinese'），而非 ISO 代码
 */
const LANG_CODE_TO_WHISPER: Record<string, string> = {
  'zh-CN': 'chinese',
  'en-US': 'english',
  ja: 'japanese',
  fr: 'french',
  de: 'german',
  ru: 'russian',
  es: 'spanish',
  it: 'italian'
}

/** 将 UI 语言代码转为 Whisper 语言提示 */
export function getWhisperLanguageHint(uiLang: string): string | undefined {
  return LANG_CODE_TO_WHISPER[uiLang]
}

/** 获取所有 Whisper 模型缓存状态 */
export async function getAllWhisperModelStatus(): Promise<WhisperModelStatusInfo[]> {
  return Promise.all(
    WHISPER_MODEL_OPTIONS.map(async ({ id }) => ({
      modelId: id,
      cached: await isWhisperCached(id)
    }))
  )
}

/**
 * 转写音频为文字
 * 调用前须确保已通过 initWhisper() 完成加载
 * @param audioData 16kHz 单声道 PCM Float32Array
 * @param language  Whisper 语言提示（如 'chinese'），不传则自动检测
 */
export async function transcribeAudio(audioData: Float32Array, language?: string): Promise<string> {
  if (workerClient.getStatus() !== 'ready') {
    throw new Error('Whisper not initialized. Call initWhisper() first.')
  }
  return workerClient.transcribe(audioData, language)
}

/**
 * 释放 Whisper 资源（终止 Worker）
 * @deprecated 卸载时请改用 deleteWhisperCache()，它同时清理 Cache
 */
export async function disposeWhisper(): Promise<void> {
  await workerClient.dispose()
}
