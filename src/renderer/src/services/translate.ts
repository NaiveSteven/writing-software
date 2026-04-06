/**
 * 翻译服务 (渲染进程侧)
 * 使用 @huggingface/transformers 运行 ONNX MarianMT(OPUS-MT) 模型
 * ONNX 推理委托给 Web Worker 执行，避免阻塞渲染主线程
 * 模型按需下载，通过英文做中转翻译支持 9 种语言
 */

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

/**
 * 翻译模型映射表（只包含 HuggingFace 上实际存在的 Xenova ONNX 版模型）
 * 注意：en-ko / ko-en 对应的 Xenova ONNX 版本不存在，已移除韩语支持。
 */
export const MODEL_MAP: Record<string, string> = {
  'en-zh': 'Xenova/opus-mt-en-zh',
  'en-ja': 'Xenova/opus-mt-en-jap',
  'en-fr': 'Xenova/opus-mt-en-fr',
  'en-de': 'Xenova/opus-mt-en-de',
  'en-ru': 'Xenova/opus-mt-en-ru',
  'en-es': 'Xenova/opus-mt-en-es',
  'en-it': 'Xenova/opus-mt-en-it',
  'zh-en': 'Xenova/opus-mt-zh-en',
  'ja-en': 'Xenova/opus-mt-jap-en',
  'fr-en': 'Xenova/opus-mt-fr-en',
  'de-en': 'Xenova/opus-mt-de-en',
  'ru-en': 'Xenova/opus-mt-ru-en',
  'es-en': 'Xenova/opus-mt-es-en',
  'it-en': 'Xenova/opus-mt-it-en'
}

/** 全局进度回调 */
let globalProgressCallback: TranslateProgressCallback | null = null

/**
 * 设置翻译模型加载进度回调
 */
export function setTranslateProgressCallback(cb: TranslateProgressCallback | null): void {
  globalProgressCallback = cb
}

/**
 * 获取语言对对应的模型 ID
 * 如果存在直接翻译模型则返回；否则返回 null 表示需要经由英文中转
 */
function getDirectModelId(sourceLang: string, targetLang: string): string | null {
  const key = `${sourceLang}-${targetLang}`
  return MODEL_MAP[key] ?? null
}

/**
 * 检查某个模型是否已在浏览器 Cache 中
 * 必须同时找到 ONNX 模型文件才算已缓存（避免只缓存了 config.json 等小文件的误判）
 */
async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      /* 只有找到 .onnx 模型文件才算真正缓存成功 */
      const hasOnnx = keys.some((req) => {
        const url = req.url
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

/**
 * 获取所有翻译模型状态
 * 扫描 Cache API 判断哪些模型已下载
 */
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

/**
 * 获取翻译所需的模型 ID 列表（可能 1 个或 2 个）
 */
export function getRequiredModelIds(sourceLang: string, targetLang: string): string[] {
  if (sourceLang === targetLang) return []
  const direct = getDirectModelId(sourceLang, targetLang)
  if (direct) return [direct]

  const toEn = getDirectModelId(sourceLang, 'en')
  const fromEn = getDirectModelId('en', targetLang)
  const ids: string[] = []
  if (toEn) ids.push(toEn)
  if (fromEn) ids.push(fromEn)
  return ids
}

/**
 * 检查翻译所需模型是否都已缓存
 */
export async function areTranslateModelsCached(sourceLang: string, targetLang: string): Promise<boolean> {
  const ids = getRequiredModelIds(sourceLang, targetLang)
  if (ids.length === 0) return true
  for (const id of ids) {
    if (loadedModelIds.has(id)) continue  /* 已在 worker 内存中 */
    const cached = await isModelCached(id)
    if (!cached) return false
  }
  return true
}

/**
 * 获取翻译所需但尚未缓存的模型 ID 列表（排除已在内存或浏览器 Cache 中的模型）
 */
export async function getMissingModelIds(sourceLang: string, targetLang: string): Promise<string[]> {
  const ids = getRequiredModelIds(sourceLang, targetLang)
  const missing: string[] = []
  for (const id of ids) {
    if (loadedModelIds.has(id)) continue  /* 已在 worker 内存中 */
    const cached = await isModelCached(id)
    if (!cached) missing.push(id)
  }
  return missing
}

/* ============================================================
   Web Worker 客户端（主线程侧）
   将 pipeline 加载和 ONNX 推理委托到独立线程，不阻塞主线程
   ============================================================ */

/** Worker 发出的消息类型（与 translate.worker.ts 协议一致） */
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

/**
 * 翻译 Worker 客户端
 * 懒初始化 Worker，以 Promise 包装消息收发
 */
class TranslateWorkerClient {
  /** 懒加载 Worker 实例 */
  private worker: Worker | null = null
  /** 待响应映射 (requestId → {resolve, reject}) */
  private pending = new Map<number, PendingCall>()
  /** 进度回调映射 */
  private progressHandlers = new Map<number, (modelId: string, status: string, progress?: number) => void>()
  /** 自增请求 ID */
  private nextId = 1

  /** 懒初始化 Worker */
  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof Worker === 'undefined') {
        throw new Error('Web Workers not supported in this environment')
      }
      this.worker = new Worker(
        new URL('../workers/translate.worker', import.meta.url),
        { type: 'module' }
      )
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.handleMessage(e.data)
      }
      this.worker.onerror = (err) => {
        console.error('[TranslateWorker] error:', err)
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
  private handleMessage(msg: WorkerResponse): void {
    if (msg.type === 'PROGRESS') {
      this.progressHandlers.get(msg.id)?.(msg.modelId, msg.status, msg.progress)
      return
    }

    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    this.progressHandlers.delete(msg.id)

    switch (msg.type) {
      case 'LOAD_OK':
      case 'UNLOAD_OK':
        p.resolve(undefined)
        break
      case 'TRANSLATE_OK':
        p.resolve(msg.result)
        break
      case 'LOAD_ERR':
      case 'TRANSLATE_ERR':
        p.reject(new Error(msg.error))
        break
    }
  }

  /** 加载指定 pipeline（已加载则 Worker 侧为 no-op） */
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
      this.pending.set(id, { resolve: (v) => resolve(v as string), reject })
      this.getWorker().postMessage({ type: 'TRANSLATE', id, text, modelId })
    })
  }

  /** 卸载指定 pipeline */
  unloadModel(modelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve: () => resolve(), reject })
      try {
        this.getWorker().postMessage({ type: 'UNLOAD', id, modelId })
      } catch {
        /* Worker 未初始化，直接 resolve */
        this.pending.delete(id)
        resolve()
      }
    })
  }
}

/** Worker 客户端单例 */
const workerClient = new TranslateWorkerClient()

/**
 * 主线程侧已加载模型集合（与 Worker 内 pipelineCache 保持同步）
 * 用于 isModelLoaded / areTranslateModelsCached 的快速同步检查
 */
const loadedModelIds = new Set<string>()

/**
 * 清除 Cache API 中某模型的所有缓存文件（仅主线程侧）
 */
async function clearModelCacheFiles(modelId: string): Promise<void> {
  try {
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      for (const req of keys) {
        if (req.url.includes(modelId.replace('/', '%2F')) || req.url.includes(modelId)) {
          await cache.delete(req)
        }
      }
    }
  } catch (err) {
    console.warn('[translate] Failed to clear cache files:', err)
  }
}

/**
 * 预下载指定模型（用于安装确认后下载）
 * 委托 Worker 加载，同步 loadedModelIds
 */
export async function downloadModel(modelId: string): Promise<void> {
  try {
    await workerClient.loadModel(modelId, (mid, status, progress) => {
      globalProgressCallback?.({ status, modelId: mid, progress })
    })
    loadedModelIds.add(modelId)
  } catch (err) {
    /* 下载失败：清除残留 Cache API 文件，避免下次误报"已安装" */
    clearModelCacheFiles(modelId).catch(() => {})
    throw err
  }
}

/**
 * 卸载指定模型 — 释放 Worker 内存 + 清除 Cache API 缓存文件
 */
export async function deleteModelCache(modelId: string): Promise<void> {
  await workerClient.unloadModel(modelId)
  loadedModelIds.delete(modelId)
  await clearModelCacheFiles(modelId)
}

/**
 * 使用单个模型执行翻译（委托到 Worker）
 */
async function runTranslation(text: string, modelId: string): Promise<string> {
  return workerClient.translateWith(text, modelId)
}

/**
 * 翻译文本
 * 支持直接翻译和英文中转翻译
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (sourceLang === targetLang) return text

  /* 直接翻译 */
  const directModel = getDirectModelId(sourceLang, targetLang)
  if (directModel) {
    return runTranslation(text, directModel)
  }

  /* 英文中转: srcLang → en → targetLang */
  const toEnModel = getDirectModelId(sourceLang, 'en')
  const fromEnModel = getDirectModelId('en', targetLang)

  if (toEnModel && fromEnModel) {
    const englishText = await runTranslation(text, toEnModel)
    return runTranslation(englishText, fromEnModel)
  }

  throw new Error(`Unsupported language pair: ${sourceLang} → ${targetLang}`)
}

/**
 * 检查指定语言对的翻译模型是否已加载到 Worker 内存
 */
export function isModelLoaded(sourceLang: string, targetLang: string): boolean {
  const directModel = getDirectModelId(sourceLang, targetLang)
  if (directModel) return loadedModelIds.has(directModel)

  const toEnModel = getDirectModelId(sourceLang, 'en')
  const fromEnModel = getDirectModelId('en', targetLang)
  if (toEnModel && fromEnModel) {
    return loadedModelIds.has(toEnModel) && loadedModelIds.has(fromEnModel)
  }

  return false
}

/**
 * 释放所有翻译 pipeline 资源
 */
export async function disposeAllTranslators(): Promise<void> {
  for (const modelId of Array.from(loadedModelIds)) {
    await workerClient.unloadModel(modelId)
  }
  loadedModelIds.clear()
}

