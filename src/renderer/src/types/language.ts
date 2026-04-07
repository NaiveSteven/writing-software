/** 支持的翻译语言代码 */
export type LanguageCode = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'ru' | 'es' | 'it'

/** 输入源语言模式：自动识别或手动指定 */
export type InputSourceLang = 'auto' | LanguageCode

/** 语言选项（用于 UI 渲染） */
export interface LanguageOption<T extends string = string> {
  code: T
  /** i18n key，对应 language.zh / language.en 等 */
  labelKey: string
}

/** 所有支持的语言选项列表 */
export const LANGUAGE_OPTIONS: LanguageOption<LanguageCode>[] = [
  { code: 'zh', labelKey: 'language.zh' },
  { code: 'en', labelKey: 'language.en' },
  { code: 'ja', labelKey: 'language.ja' },
  { code: 'ko', labelKey: 'language.ko' },
  { code: 'fr', labelKey: 'language.fr' },
  { code: 'de', labelKey: 'language.de' },
  { code: 'ru', labelKey: 'language.ru' },
  { code: 'es', labelKey: 'language.es' },
  { code: 'it', labelKey: 'language.it' }
]

/** 输入源语言选项列表 */
export const INPUT_SOURCE_LANGUAGE_OPTIONS: LanguageOption<InputSourceLang>[] = [
  { code: 'auto', labelKey: 'language.auto' },
  ...LANGUAGE_OPTIONS
]
