/**
 * 翻译模型路由配置
 * 仅描述“有哪些模型、哪些语言方向可走哪条路”。
 */

/**
 * 静态 Marian 模型映射表。
 * 日语 / 韩语相关方向改由 NLLB 多语言模型动态处理。
 */
export const MODEL_MAP: Record<string, string> = {
  'en-zh': 'Xenova/opus-mt-en-zh',
  'en-fr': 'Xenova/opus-mt-en-fr',
  'en-de': 'Xenova/opus-mt-en-de',
  'en-ru': 'Xenova/opus-mt-en-ru',
  'en-es': 'Xenova/opus-mt-en-es',
  'en-it': 'Xenova/opus-mt-en-it',
  'zh-en': 'Xenova/opus-mt-zh-en',
  'fr-en': 'Xenova/opus-mt-fr-en',
  'de-en': 'Xenova/opus-mt-de-en',
  'ru-en': 'Xenova/opus-mt-ru-en',
  'es-en': 'Xenova/opus-mt-es-en',
  'it-en': 'Xenova/opus-mt-it-en'
}

/** 日韩增强路线统一使用的多语言模型。 */
export const EAST_ASIA_MODEL_ID = 'Xenova/nllb-200-distilled-600M'

/** 当前项目支持的 NLLB 语言代码映射。 */
const NLLB_LANG_CODE_MAP: Record<string, string> = {
  en: 'eng_Latn',
  zh: 'zho_Hans',
  ja: 'jpn_Jpan',
  ko: 'kor_Hang',
  fr: 'fra_Latn',
  de: 'deu_Latn',
  ru: 'rus_Cyrl',
  es: 'spa_Latn',
  it: 'ita_Latn'
}

/** 常规模型体积提示。 */
const DEFAULT_TRANSLATE_MODEL_SIZE_HINT = '~105 MB'

/** 日韩增强模型体积提示。 */
const EAST_ASIA_MODEL_SIZE_HINT = '~900 MB'

/** 翻译执行引擎。 */
export type TranslateRuntime = 'marian' | 'nllb'

/** 单次翻译执行所需的模型与附加参数。 */
export interface TranslateModelRequest {
  modelId: string
  runtime: TranslateRuntime
  srcLang?: string
  tgtLang?: string
}

/** 设置页和下载弹窗使用的翻译模型元信息。 */
export interface TranslateModelMeta {
  modelId: string
  label: string
  labelKey?: string
  sizeHint: string
}

/** 仅基于静态 Marian 映射生成的模型目录。 */
const STATIC_TRANSLATE_MODEL_CATALOG: readonly TranslateModelMeta[] = Object.entries(MODEL_MAP).map(
  ([langPair, modelId]) => ({
    modelId,
    label: langPair.replace('-', ' → '),
    sizeHint: DEFAULT_TRANSLATE_MODEL_SIZE_HINT
  })
)

/** 翻译模型目录。 */
const TRANSLATE_MODEL_CATALOG: readonly TranslateModelMeta[] = [
  ...STATIC_TRANSLATE_MODEL_CATALOG,
  {
    modelId: EAST_ASIA_MODEL_ID,
    label: 'JA / KO enhanced multilingual',
    labelKey: 'settings.translateModelEastAsia',
    sizeHint: EAST_ASIA_MODEL_SIZE_HINT
  }
]

/** 按模型 ID 快速查找元信息。 */
const TRANSLATE_MODEL_META_BY_ID = Object.fromEntries(
  TRANSLATE_MODEL_CATALOG.map((item) => [item.modelId, item])
) as Record<string, TranslateModelMeta>

/** 获取翻译模型目录。 */
export function getTranslateModelCatalog(): readonly TranslateModelMeta[] {
  return TRANSLATE_MODEL_CATALOG
}

/** 获取模型展示元信息。 */
export function getTranslateModelMeta(modelId: string): TranslateModelMeta {
  return TRANSLATE_MODEL_META_BY_ID[modelId] ?? {
    modelId,
    label: modelId,
    sizeHint: DEFAULT_TRANSLATE_MODEL_SIZE_HINT
  }
}

/** 翻译路由结果。 */
export type TranslateRoute =
  | { kind: 'same' }
  | { kind: 'direct'; model: TranslateModelRequest }
  | { kind: 'bridge'; toEnModel: TranslateModelRequest; fromEnModel: TranslateModelRequest }
  | { kind: 'unsupported' }

/** 查询 NLLB 语言代码。 */
function getNllbLangCode(lang: string): string | null {
  return NLLB_LANG_CODE_MAP[lang] ?? null
}

/** 判断当前语言对是否应切到日韩增强模型。 */
function shouldUseEastAsiaModel(sourceLang: string, targetLang: string): boolean {
  if (sourceLang === targetLang) return false

  const sourceCode = getNllbLangCode(sourceLang)
  const targetCode = getNllbLangCode(targetLang)
  if (!sourceCode || !targetCode) return false

  return sourceLang === 'ja' || sourceLang === 'ko' || targetLang === 'ja' || targetLang === 'ko'
}

/**
 * 构造日韩增强模型请求。
 * 旧的 en→ko 仓库 tokenizer 元数据不完整，会把 <pad> 这类特殊 token 直接暴露到 UI。
 */
function getEastAsiaModelRequest(sourceLang: string, targetLang: string): TranslateModelRequest | null {
  if (!shouldUseEastAsiaModel(sourceLang, targetLang)) return null

  return {
    modelId: EAST_ASIA_MODEL_ID,
    runtime: 'nllb',
    srcLang: getNllbLangCode(sourceLang) ?? undefined,
    tgtLang: getNllbLangCode(targetLang) ?? undefined
  }
}

/** 构造常规 Marian 直译请求。 */
function getMarianModelRequest(sourceLang: string, targetLang: string): TranslateModelRequest | null {
  const modelId = MODEL_MAP[`${sourceLang}-${targetLang}`]
  if (!modelId) return null

  return {
    modelId,
    runtime: 'marian'
  }
}

/** 获取语言对对应的直接模型配置。 */
function getDirectModel(sourceLang: string, targetLang: string): TranslateModelRequest | null {
  return getEastAsiaModelRequest(sourceLang, targetLang)
    ?? getMarianModelRequest(sourceLang, targetLang)
}

/** 解析指定语言对的翻译路由。 */
export function resolveTranslateRoute(sourceLang: string, targetLang: string): TranslateRoute {
  if (sourceLang === targetLang) return { kind: 'same' }

  const directModel = getDirectModel(sourceLang, targetLang)
  if (directModel) {
    return { kind: 'direct', model: directModel }
  }

  const toEnModel = getDirectModel(sourceLang, 'en')
  const fromEnModel = getDirectModel('en', targetLang)
  if (toEnModel && fromEnModel) {
    return { kind: 'bridge', toEnModel, fromEnModel }
  }

  return { kind: 'unsupported' }
}

/** 判断该语言方向是否存在可用模型路线。 */
export function isTranslatePairSupported(sourceLang: string, targetLang: string): boolean {
  return resolveTranslateRoute(sourceLang, targetLang).kind !== 'unsupported'
}

/** 获取翻译所需的模型 ID 列表。 */
export function getRequiredModelIds(sourceLang: string, targetLang: string): string[] {
  const route = resolveTranslateRoute(sourceLang, targetLang)

  switch (route.kind) {
    case 'same':
    case 'unsupported':
      return []
    case 'direct':
      return [route.model.modelId]
    case 'bridge':
      return Array.from(new Set([route.toEnModel.modelId, route.fromEnModel.modelId]))
  }
}
