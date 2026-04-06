/**
 * 翻译服务 (渲染进程侧)
 * 使用 @huggingface/transformers 在 Chromium 中运行 ONNX MarianMT(OPUS-MT) 模型
 * 模型按需下载，通过英文做中转翻译支持 9 种语言
 * 默认使用 hf-mirror.com 镜像源解决国内网络问题
 */

import {
  pipeline,
  env,
  type TranslationPipeline
} from '@huggingface/transformers'

/* 使用 HuggingFace 镜像源（解决国内 SSL/网络问题） */
env.remoteHost = 'https://hf-mirror.com'
/* 允许本地模型 */
env.allowLocalModels = false

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
 * 多文件进度聚合器（高水位线策略）
 * transformers.js 下载模型时有多个文件，每个文件独立报 0~100%。
 * 新文件开始加入时，其 0% 不会拉低已聚合的总进度（高水位线防止倒退）。
 */
class ProgressAggregator {
  /** 每个文件的当前进度 (0~100) */
  private fileProgress = new Map<string, number>()
  /** 已知总文件数（从 initiate/download 事件累计） */
  private totalFiles = 0
  /** 上一次输出的聚合进度（防止倒退） */
  private highWatermark = 0

  /** 新文件开始时注册（用于确保分母正确） */
  addFile(fileName: string): void {
    if (!this.fileProgress.has(fileName)) {
      this.fileProgress.set(fileName, 0)
      this.totalFiles = this.fileProgress.size
    }
  }

  /** 更新某文件进度，返回聚合后总进度（单调递增） */
  update(fileName: string, progress: number): number {
    this.fileProgress.set(fileName, progress)
    /* 用已知的最大文件数作分母，避免新文件加入时进度倒退 */
    const denominator = Math.max(this.totalFiles, this.fileProgress.size)
    const values = Array.from(this.fileProgress.values())
    const avg = values.reduce((a, b) => a + b, 0) / denominator
    /* 高水位：不允许进度倒退 */
    this.highWatermark = Math.max(this.highWatermark, avg)
    return this.highWatermark
  }

  /** 重置 */
  reset(): void {
    this.fileProgress.clear()
    this.totalFiles = 0
    this.highWatermark = 0
  }
}

/** 全局进度聚合器 */
const progressAggregator = new ProgressAggregator()

/**
 * ONNX 格式的 OPUS-MT 模型映射
 * 键: "源语言-目标语言", 值: HuggingFace 模型 ID (Xenova ONNX 版)
 */
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

/** 已加载的翻译 pipeline 缓存 (ModelID → Pipeline) */
const pipelineCache = new Map<string, TranslationPipeline>()

/** 当前正在加载的模型 Promise (防止并发加载同一模型) */
const loadingPromises = new Map<string, Promise<TranslationPipeline>>()

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
    if (pipelineCache.has(id)) continue
    const cached = await isModelCached(id)
    if (!cached) return false
  }
  return true
}

/**
 * 获取翻译所需但尚未缓存的模型 ID 列表（排除已在内存或浏览器 Cache 中的模型）
 * 用于下载确认弹窗中只展示/下载真正缺失的模型
 */
export async function getMissingModelIds(sourceLang: string, targetLang: string): Promise<string[]> {
  const ids = getRequiredModelIds(sourceLang, targetLang)
  const missing: string[] = []
  for (const id of ids) {
    if (pipelineCache.has(id)) continue      // 已在内存中
    const cached = await isModelCached(id)
    if (!cached) missing.push(id)            // 未缓存，需要下载
  }
  return missing
}

/**
 * 加载翻译 pipeline（带缓存 + 并发保护）
 */
async function loadPipeline(modelId: string): Promise<TranslationPipeline> {
  /* 已缓存 */
  const cached = pipelineCache.get(modelId)
  if (cached) return cached

  /* 正在加载中，复用 Promise */
  const loading = loadingPromises.get(modelId)
  if (loading) return loading

  /* 首次加载 */
  const promise = (async () => {
    /*
     * 禁止 Worker 代理，避免 Electron 打包问题。
     * 注意：env.backends.onnx.wasm 在第一次 pipeline() 调用前可能尚未初始化，
     * 直接用可选链赋值会静默失败，导致第一次安装走 WebWorker 模式失败。
     * 因此需先确保对象存在再赋值。
     */
    const onnxEnv = env.backends?.onnx
    if (onnxEnv) {
      if (!onnxEnv.wasm) {
        (onnxEnv as { wasm?: { proxy: boolean } }).wasm = { proxy: false }
      } else {
        onnxEnv.wasm.proxy = false
      }
    }

    /* 重置进度聚合器 */
    progressAggregator.reset()

    const pipe = (await pipeline('translation', modelId, {
      /* q4 量化：对应 *_q4.onnx，兼容性优于 q8(_quantized)，避免 ONNX Runtime NB-bits 报错 */
      dtype: 'q4',
      device: 'wasm',
      progress_callback: (p: Record<string, unknown>) => {
        const status = p.status as string
        const file = (p.file as string) || 'unknown'
        let aggregated: number | undefined

        /* 文件开始下载时注册，确保总文件数（分母）正确 */
        if (status === 'initiate' || status === 'download') {
          progressAggregator.addFile(file)
        }

        if (status === 'progress' && typeof p.progress === 'number') {
          /* 聚合多文件进度（高水位，不倒退） */
          aggregated = progressAggregator.update(file, p.progress as number)
        }

        globalProgressCallback?.({
          status,
          modelId,
          progress: aggregated
        })
      }
    })) as TranslationPipeline

    pipelineCache.set(modelId, pipe)
    loadingPromises.delete(modelId)
    return pipe
  })()

  loadingPromises.set(modelId, promise)

  try {
    return await promise
  } catch (err) {
    loadingPromises.delete(modelId)
    /* 下载失败时清除已缓存的部分文件，避免下次检测到残留文件误报"已安装" */
    deleteModelCache(modelId).catch(() => { /* 清理失败可忽略 */ })
    throw err
  }
}

/**
 * 预下载指定模型（用于安装确认后下载）
 */
export async function downloadModel(modelId: string): Promise<void> {
  await loadPipeline(modelId)
}

/**
 * 卸载指定模型 — 清除 Cache API 中该模型的所有缓存
 */
export async function deleteModelCache(modelId: string): Promise<void> {
  /* 先释放内存中的 pipeline */
  const pipe = pipelineCache.get(modelId)
  if (pipe) {
    await pipe.dispose()
    pipelineCache.delete(modelId)
  }

  /* 清除 Cache API 中的文件 */
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
    console.warn('Failed to delete model cache:', err)
  }
}

/**
 * 执行单模型翻译
 */
async function runTranslation(text: string, modelId: string): Promise<string> {
  const pipe = await loadPipeline(modelId)
  const result = await pipe(text) as Array<{ translation_text: string }>
  return result[0].translation_text
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
 * 检查指定语言对的翻译模型是否已加载到内存
 */
export function isModelLoaded(sourceLang: string, targetLang: string): boolean {
  const directModel = getDirectModelId(sourceLang, targetLang)
  if (directModel) return pipelineCache.has(directModel)

  const toEnModel = getDirectModelId(sourceLang, 'en')
  const fromEnModel = getDirectModelId('en', targetLang)
  if (toEnModel && fromEnModel) {
    return pipelineCache.has(toEnModel) && pipelineCache.has(fromEnModel)
  }

  return false
}

/**
 * 释放所有翻译 pipeline 资源
 */
export async function disposeAllTranslators(): Promise<void> {
  for (const [key, pipe] of pipelineCache) {
    await pipe.dispose()
    pipelineCache.delete(key)
  }
}
