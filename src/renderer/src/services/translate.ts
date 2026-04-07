/**
 * 翻译服务（渲染进程侧）
 * 使用 Web Worker + onnxruntime-web 稳定版执行本地翻译
 */

import {
  MODEL_MAP,
  getRequiredModelIds,
  isTranslatePairSupported,
  resolveTranslateRoute,
} from './translate-route'

export { MODEL_MAP, getRequiredModelIds, isTranslatePairSupported } from './translate-route'

/** 翻译进度回调（聚合后的总进度） */
export type TranslateProgressCallback = (progress: {
  status: string
  modelId: string
  /** 聚合后的总进度 0~100 */
  progress?: number
}) => void

/** 模型安装状态 */
export interface ModelInfo {
  /** 模型 ID */
  modelId: string
  /** 语言对描述 (用于展示) */
  langPair: string
  /** 是否已缓存到浏览器 */
  cached: boolean
}

/** 全局进度回调 */
let globalProgressCallback: TranslateProgressCallback | null = null

/** Worker 内已加载模型的镜像状态 */
const loadedModelIds = new Set<string>()

/** 设置翻译模型加载进度回调 */
export function setTranslateProgressCallback(cb: TranslateProgressCallback | null): void {
  globalProgressCallback = cb
}

/** 检查某个模型是否已在浏览器 Cache 中 */
async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      const hasOnnx = keys.some((request) => {
        const url = request.url
        const matchesModel = url.includes(modelId.replace('/', '%2F')) || url.includes(modelId)
        return matchesModel && url.endsWith('.onnx')
      })
      if (hasOnnx) return true
    }
    return false
  } catch {
    return false
  }
}

/** 获取所有翻译模型状态 */
export async function getAllTranslateModelStatus(): Promise<ModelInfo[]> {
  const seen = new Set<string>()
  const result: ModelInfo[] = []
  for (const [langPair, modelId] of Object.entries(MODEL_MAP)) {
    if (seen.has(modelId)) continue
    seen.add(modelId)
    const cached = await isModelCached(modelId)
    result.push({ modelId, langPair, cached })
  }
  return result
}

/** 判断翻译所需模型是否都已缓存 */
export async function areTranslateModelsCached(sourceLang: string, targetLang: string): Promise<boolean> {
  if (sourceLang === targetLang) return true
  if (!isTranslatePairSupported(sourceLang, targetLang)) return false

  const ids = getRequiredModelIds(sourceLang, targetLang)
  for (const id of ids) {
    if (loadedModelIds.has(id)) continue
    const cached = await isModelCached(id)
    if (!cached) return false
  }
  return true
}

/** 获取翻译所需但尚未缓存的模型 ID 列表 */
export async function getMissingModelIds(sourceLang: string, targetLang: string): Promise<string[]> {
  if (sourceLang === targetLang) return []
  if (!isTranslatePairSupported(sourceLang, targetLang)) return []

  const ids = getRequiredModelIds(sourceLang, targetLang)
  const missing: string[] = []
  for (const id of ids) {
    if (loadedModelIds.has(id)) continue
    const cached = await isModelCached(id)
    if (!cached) missing.push(id)
  }
  return missing
}

/** Worker 消息类型 */
type WorkerResponse =
  | { type: 'PROGRESS'; id: number; modelId: string; status: string; progress?: number }
  | { type: 'LOAD_OK'; id: number }
  | { type: 'LOAD_ERR'; id: number; error: string }
  | { type: 'TRANSLATE_OK'; id: number; result: string }
  | { type: 'TRANSLATE_ERR'; id: number; error: string }
  | { type: 'UNLOAD_OK'; id: number }

/** 待响应 Promise 回调 */
interface PendingCall {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

/** 翻译 Worker 客户端 */
class TranslateWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<number, PendingCall>()
  private progressHandlers = new Map<number, (modelId: string, status: string, progress?: number) => void>()
  private nextId = 1

  /** 懒初始化 Worker */
  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof Worker === 'undefined') {
        throw new Error('Web Workers not supported in this environment')
      }

      this.worker = new Worker(new URL('../workers/translate.worker', import.meta.url), {
        type: 'module'
      })

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleMessage(event.data)
      }

      this.worker.onerror = (error) => {
        console.error('[TranslateWorker] error:', error)
        for (const { reject } of this.pending.values()) {
          reject(new Error('Worker error'))
        }
        this.pending.clear()
        this.progressHandlers.clear()
        this.worker = null
      }
    }

    return this.worker
  }

  /** 分发 Worker 响应 */
  private handleMessage(message: WorkerResponse): void {
    if (message.type === 'PROGRESS') {
      this.progressHandlers.get(message.id)?.(message.modelId, message.status, message.progress)
      return
    }

    const pendingCall = this.pending.get(message.id)
    if (!pendingCall) return

    this.pending.delete(message.id)
    this.progressHandlers.delete(message.id)

    switch (message.type) {
      case 'LOAD_OK':
      case 'UNLOAD_OK':
        pendingCall.resolve(undefined)
        break
      case 'TRANSLATE_OK':
        pendingCall.resolve(message.result)
        break
      case 'LOAD_ERR':
      case 'TRANSLATE_ERR':
        pendingCall.reject(new Error(message.error))
        break
    }
  }

  /** 加载指定模型 */
  loadModel(
    modelId: string,
    onProgress?: (modelId: string, status: string, progress?: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve: () => resolve(), reject })
      if (onProgress) this.progressHandlers.set(id, onProgress)
      this.getWorker().postMessage({ type: 'LOAD', id, modelId })
    })
  }

  /** 执行翻译推理 */
  translateWith(text: string, modelId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve: (value) => resolve(value as string), reject })
      this.getWorker().postMessage({ type: 'TRANSLATE', id, text, modelId })
    })
  }

  /** 卸载指定模型 */
  unloadModel(modelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve: () => resolve(), reject })
      try {
        this.getWorker().postMessage({ type: 'UNLOAD', id, modelId })
      } catch {
        this.pending.delete(id)
        resolve()
      }
    })
  }
}

/** Worker 客户端单例 */
const workerClient = new TranslateWorkerClient()

/** 清除 Cache API 中某模型的所有缓存文件 */
async function clearModelCacheFiles(modelId: string): Promise<void> {
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      for (const request of keys) {
        if (request.url.includes(modelId.replace('/', '%2F')) || request.url.includes(modelId)) {
          await cache.delete(request)
        }
      }
    }
  } catch (error) {
    console.warn('[translate] Failed to clear cache files:', error)
  }
}

/** 预下载指定模型 */
export async function downloadModel(modelId: string): Promise<void> {
  try {
    await workerClient.loadModel(modelId, (currentModelId, status, progress) => {
      globalProgressCallback?.({ status, modelId: currentModelId, progress })
    })
    loadedModelIds.add(modelId)
  } catch (error) {
    clearModelCacheFiles(modelId).catch(() => {})
    throw error
  }
}

/** 卸载指定模型并清除缓存 */
export async function deleteModelCache(modelId: string): Promise<void> {
  await workerClient.unloadModel(modelId)
  loadedModelIds.delete(modelId)
  await clearModelCacheFiles(modelId)
}

/** 使用单个模型执行翻译 */
async function runTranslation(text: string, modelId: string): Promise<string> {
  return workerClient.translateWith(text, modelId)
}

/** 翻译文本 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const route = resolveTranslateRoute(sourceLang, targetLang)

  switch (route.kind) {
    case 'same':
      return text
    case 'direct':
      return runTranslation(text, route.modelId)
    case 'bridge': {
      const englishText = await runTranslation(text, route.toEnModelId)
      return runTranslation(englishText, route.fromEnModelId)
    }
    case 'unsupported':
      throw new Error(`Unsupported language pair: ${sourceLang} → ${targetLang}`)
  }
}

/** 检查指定语言对的翻译模型是否已加载到 Worker 内存 */
export function isModelLoaded(sourceLang: string, targetLang: string): boolean {
  const requiredModelIds = getRequiredModelIds(sourceLang, targetLang)
  if (requiredModelIds.length === 0) {
    return sourceLang === targetLang
  }

  return requiredModelIds.every((modelId) => loadedModelIds.has(modelId))
}

/** 释放所有翻译 pipeline 资源 */
export async function disposeAllTranslators(): Promise<void> {
  for (const modelId of Array.from(loadedModelIds)) {
    await workerClient.unloadModel(modelId)
  }
  loadedModelIds.clear()
}

