import { detect } from 'tinyld'
import type { LanguageCode } from '../types/language'

/**
 * tinyld 语言代码 → 应用语言代码的映射
 * tinyld 返回 ISO 639-1 两字母代码
 */
const LANG_CODE_MAP: Record<string, LanguageCode> = {
  zh: 'zh',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  ru: 'ru',
  es: 'es',
  it: 'it'
}

/** 常见短英文表达，优先按英语处理，避免 tinyld 误判成意大利语等。 */
const COMMON_SHORT_ENGLISH_PHRASES = new Set([
  'hello',
  'hi',
  'hey',
  'ok',
  'okay',
  'test',
  'thanks',
  'thank you',
  'good morning',
  'good night',
  'how are you',
  'i love you',
  'yes',
  'no'
])

const HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/
const HIRAGANA_KATAKANA_RE = /[\u3040-\u30FF]/
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF]/
const CYRILLIC_RE = /[\u0400-\u04FF]/
const ASCII_LATIN_RE = /^[A-Za-z0-9\s.,!?;:'"()\-_/&%]+$/

/**
 * 先用脚本特征做快速判断。
 * 这些文字系统区分度高，比统计检测更稳定。
 */
function detectByScript(text: string): LanguageCode | null {
  if (HANGUL_RE.test(text)) return 'ko'
  if (HIRAGANA_KATAKANA_RE.test(text)) return 'ja'
  if (HAN_RE.test(text)) return 'zh'
  if (CYRILLIC_RE.test(text)) return 'ru'
  return null
}

/**
 * 针对很短的 ASCII 英文做兜底。
 * tinyld 对单词级输入容易误判为意大利语等拉丁语种。
 */
function detectShortEnglish(text: string): LanguageCode | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return null
  if (!ASCII_LATIN_RE.test(normalized)) return null
  if (COMMON_SHORT_ENGLISH_PHRASES.has(normalized)) return 'en'

  const words = normalized.split(' ').filter(Boolean)
  if (words.length === 1 && normalized.length <= 4) return 'en'
  if (words.some((word) => ['the', 'you', 'are', 'is', 'hello', 'good', 'thanks', 'thank'].includes(word))) {
    return 'en'
  }

  return null
}

/**
 * 自动检测文本语言
 * @returns 识别到的语言代码，未识别返回 'en' 作为默认值
 */
export function detectLanguage(text: string): LanguageCode {
  if (!text.trim()) return 'en'

  const byScript = detectByScript(text)
  if (byScript) return byScript

  const shortEnglish = detectShortEnglish(text)
  if (shortEnglish) return shortEnglish

  const detected = detect(text)
  return LANG_CODE_MAP[detected] || 'en'
}
