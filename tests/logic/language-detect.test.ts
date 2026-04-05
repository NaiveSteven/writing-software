/**
 * 语言检测工具测试
 * 验证 tinyld 集成和语言代码映射
 */
import { describe, it, expect } from 'vitest'
import { detectLanguage } from '@renderer/utils/language-detect'

describe('detectLanguage', () => {
  it('检测中文', () => {
    expect(detectLanguage('你好世界，今天天气不错')).toBe('zh')
  })

  it('检测英文', () => {
    expect(detectLanguage('Hello world, how are you doing today')).toBe('en')
  })

  it('检测日文', () => {
    expect(detectLanguage('こんにちは世界、今日はいい天気ですね')).toBe('ja')
  })

  it('检测韩文', () => {
    expect(detectLanguage('안녕하세요 세계, 오늘 날씨가 좋네요')).toBe('ko')
  })

  it('检测法文', () => {
    expect(detectLanguage('Bonjour le monde, comment allez-vous aujourd\'hui')).toBe('fr')
  })

  it('检测德文', () => {
    expect(detectLanguage('Hallo Welt, wie geht es Ihnen heute')).toBe('de')
  })

  it('空字符串返回默认值 en', () => {
    expect(detectLanguage('')).toBe('en')
  })

  it('仅空格返回默认值 en', () => {
    expect(detectLanguage('   ')).toBe('en')
  })

  it('不支持的语言回退到 en', () => {
    /* 单个字符或过短的文本可能无法检测 */
    expect(detectLanguage('x')).toBe('en')
  })
})
