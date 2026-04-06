import { detect } from 'tinyld'
import type { LanguageCode } from '../types/language'

/**
 * tinyld 语言代码 → 应用语言代码的映射
 * tinyld 返回 ISO 639-1 两字母代码
 * 注意：ko（韩语）已移除，不再支持
 */
const LANG_CODE_MAP: Record<string, LanguageCode> = {
  zh: 'zh',
  en: 'en',
  ja: 'ja',
  fr: 'fr',
  de: 'de',
  ru: 'ru',
  es: 'es',
  it: 'it'
}

/**
 * 自动检测文本语言
 * @returns 识别到的语言代码，未识别返回 'en' 作为默认值
 */
export function detectLanguage(text: string): LanguageCode {
  if (!text.trim()) return 'en'

  const detected = detect(text)
  return LANG_CODE_MAP[detected] || 'en'
}
