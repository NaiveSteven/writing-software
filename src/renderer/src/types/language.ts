/** 支持的翻译语言代码（韩语已移除，对应 ONNX 模型不存在） */
export type LanguageCode = 'zh' | 'en' | 'ja' | 'fr' | 'de' | 'ru' | 'es' | 'it'

/** 语言选项（用于 UI 渲染） */
export interface LanguageOption {
  code: LanguageCode
  /** i18n key，对应 language.zh / language.en 等 */
  labelKey: string
}

/** 所有支持的语言选项列表 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'zh', labelKey: 'language.zh' },
  { code: 'en', labelKey: 'language.en' },
  { code: 'ja', labelKey: 'language.ja' },
  { code: 'fr', labelKey: 'language.fr' },
  { code: 'de', labelKey: 'language.de' },
  { code: 'ru', labelKey: 'language.ru' },
  { code: 'es', labelKey: 'language.es' },
  { code: 'it', labelKey: 'language.it' }
]
