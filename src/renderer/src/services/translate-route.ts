/**
 * 翻译模型路由配置
 * 仅描述“有哪些模型、哪些语言方向可走哪条路”。
 */

/**
 * 翻译模型映射表
 * 说明：当前可稳定使用的韩语方向仅有 ko→en。
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
  'ko-en': 'Xenova/opus-mt-ko-en',
  'fr-en': 'Xenova/opus-mt-fr-en',
  'de-en': 'Xenova/opus-mt-de-en',
  'ru-en': 'Xenova/opus-mt-ru-en',
  'es-en': 'Xenova/opus-mt-es-en',
  'it-en': 'Xenova/opus-mt-it-en'
}

/** 翻译路由结果 */
export type TranslateRoute =
  | { kind: 'same' }
  | { kind: 'direct'; modelId: string }
  | { kind: 'bridge'; toEnModelId: string; fromEnModelId: string }
  | { kind: 'unsupported' }

/** 获取语言对对应的直接模型 ID */
function getDirectModelId(sourceLang: string, targetLang: string): string | null {
  return MODEL_MAP[`${sourceLang}-${targetLang}`] ?? null
}

/** 解析指定语言对的翻译路由 */
export function resolveTranslateRoute(sourceLang: string, targetLang: string): TranslateRoute {
  if (sourceLang === targetLang) return { kind: 'same' }

  const directModelId = getDirectModelId(sourceLang, targetLang)
  if (directModelId) {
    return { kind: 'direct', modelId: directModelId }
  }

  const toEnModelId = getDirectModelId(sourceLang, 'en')
  const fromEnModelId = getDirectModelId('en', targetLang)
  if (toEnModelId && fromEnModelId) {
    return { kind: 'bridge', toEnModelId, fromEnModelId }
  }

  return { kind: 'unsupported' }
}

/** 判断该语言方向是否存在可用模型路线 */
export function isTranslatePairSupported(sourceLang: string, targetLang: string): boolean {
  return resolveTranslateRoute(sourceLang, targetLang).kind !== 'unsupported'
}

/** 获取翻译所需的模型 ID 列表（可能 1 个或 2 个） */
export function getRequiredModelIds(sourceLang: string, targetLang: string): string[] {
  const route = resolveTranslateRoute(sourceLang, targetLang)

  switch (route.kind) {
    case 'same':
    case 'unsupported':
      return []
    case 'direct':
      return [route.modelId]
    case 'bridge':
      return [route.toEnModelId, route.fromEnModelId]
  }
}