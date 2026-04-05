import type { LanguageCode } from './language'

/** 消息输入方式 */
export type InputType = 'text' | 'voice'

/** 消息记录 */
export interface Message {
  id: number
  /** 原文内容 */
  content: string
  /** 检测到的源语言 */
  sourceLang: string
  /** 翻译后的文字 */
  translatedText: string | null
  /** 翻译目标语言 */
  targetLang: LanguageCode | null
  /** 输入方式: 键盘/语音 */
  inputType: InputType
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/**
 * 将数据库记录映射为前端 Message 类型
 * 统一字段命名风格 (snake_case → camelCase)
 */
export function mapDbRecord(record: Record<string, unknown>): Message {
  return {
    id: record.id as number,
    content: record.content as string,
    sourceLang: record.source_lang as string,
    translatedText: (record.translated_text as string) || null,
    targetLang: (record.target_lang as LanguageCode) || null,
    inputType: record.input_type as InputType,
    createdAt: record.created_at as string,
    updatedAt: record.updated_at as string
  }
}
