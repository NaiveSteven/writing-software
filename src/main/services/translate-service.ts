/**
 * 翻译服务
 * TODO: Phase 5 实现 — 集成 @huggingface/transformers + MarianMT 模型
 * 当前为接口预留，返回占位结果
 */

/** 支持的 9 种翻译目标语言 */
export const SUPPORTED_LANGUAGES = [
  'zh', 'en', 'ja', 'ko', 'fr', 'de', 'ru', 'es', 'it'
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * OPUS-MT 模型映射表
 * 键: "源语言-目标语言", 值: HuggingFace 模型 ID
 */
export const MODEL_MAP: Record<string, string> = {
  'en-zh': 'Helsinki-NLP/opus-mt-en-zh',
  'en-ja': 'Helsinki-NLP/opus-mt-en-jap',
  'en-ko': 'Helsinki-NLP/opus-mt-en-ko',
  'en-fr': 'Helsinki-NLP/opus-mt-en-fr',
  'en-de': 'Helsinki-NLP/opus-mt-en-de',
  'en-ru': 'Helsinki-NLP/opus-mt-en-ru',
  'en-es': 'Helsinki-NLP/opus-mt-en-es',
  'en-it': 'Helsinki-NLP/opus-mt-en-it',
  'zh-en': 'Helsinki-NLP/opus-mt-zh-en',
  'ja-en': 'Helsinki-NLP/opus-mt-jap-en',
  'ko-en': 'Helsinki-NLP/opus-mt-ko-en',
  'fr-en': 'Helsinki-NLP/opus-mt-fr-en',
  'de-en': 'Helsinki-NLP/opus-mt-de-en',
  'ru-en': 'Helsinki-NLP/opus-mt-ru-en',
  'es-en': 'Helsinki-NLP/opus-mt-es-en',
  'it-en': 'Helsinki-NLP/opus-mt-it-en'
}

export class TranslateService {
  private static instance: TranslateService | null = null

  static getInstance(): TranslateService {
    if (!TranslateService.instance) {
      TranslateService.instance = new TranslateService()
    }
    return TranslateService.instance
  }

  /**
   * 翻译文本
   * 如果没有直接的语言对模型，会通过英文做中转翻译
   */
  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    if (sourceLang === targetLang) return text

    const directKey = `${sourceLang}-${targetLang}`

    /* 有直接模型则直接翻译 */
    if (MODEL_MAP[directKey]) {
      return this.runTranslation(text, MODEL_MAP[directKey])
    }

    /* 否则通过英文中转: srcLang → en → targetLang */
    const toEnKey = `${sourceLang}-en`
    const fromEnKey = `en-${targetLang}`

    if (MODEL_MAP[toEnKey] && MODEL_MAP[fromEnKey]) {
      const englishText = await this.runTranslation(text, MODEL_MAP[toEnKey])
      return this.runTranslation(englishText, MODEL_MAP[fromEnKey])
    }

    throw new Error(`Unsupported language pair: ${sourceLang} → ${targetLang}`)
  }

  /** 执行翻译推理 */
  private async runTranslation(_text: string, _modelId: string): Promise<string> {
    // TODO: 加载对应 OPUS-MT 模型并执行翻译
    return `[Translation placeholder]`
  }
}
