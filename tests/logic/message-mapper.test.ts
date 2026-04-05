/**
 * Message 类型映射测试
 */
import { describe, it, expect } from 'vitest'
import { mapDbRecord } from '@renderer/types/message'

describe('mapDbRecord', () => {
  it('将 snake_case 数据库记录映射为 camelCase', () => {
    const dbRow = {
      id: 1,
      content: 'Hello',
      source_lang: 'en',
      translated_text: '你好',
      target_lang: 'zh',
      input_type: 'text',
      created_at: '2026-04-05 10:00:00',
      updated_at: '2026-04-05 10:00:01'
    }

    const msg = mapDbRecord(dbRow)

    expect(msg.id).toBe(1)
    expect(msg.content).toBe('Hello')
    expect(msg.sourceLang).toBe('en')
    expect(msg.translatedText).toBe('你好')
    expect(msg.targetLang).toBe('zh')
    expect(msg.inputType).toBe('text')
    expect(msg.createdAt).toBe('2026-04-05 10:00:00')
    expect(msg.updatedAt).toBe('2026-04-05 10:00:01')
  })

  it('translated_text 为 null 时保持 null', () => {
    const dbRow = {
      id: 2,
      content: 'test',
      source_lang: 'en',
      translated_text: null,
      target_lang: null,
      input_type: 'voice',
      created_at: '2026-04-05 10:00:00',
      updated_at: '2026-04-05 10:00:00'
    }

    const msg = mapDbRecord(dbRow)
    expect(msg.translatedText).toBeNull()
    expect(msg.targetLang).toBeNull()
    expect(msg.inputType).toBe('voice')
  })

  it('translated_text 为空字符串时映射为 null', () => {
    const dbRow = {
      id: 3,
      content: 'test',
      source_lang: 'en',
      translated_text: '',
      target_lang: 'zh',
      input_type: 'text',
      created_at: '2026-04-05 10:00:00',
      updated_at: '2026-04-05 10:00:00'
    }

    const msg = mapDbRecord(dbRow)
    /* 空字符串被 || null 转换为 null */
    expect(msg.translatedText).toBeNull()
  })
})
