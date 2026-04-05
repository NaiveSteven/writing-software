/**
 * 格式化工具测试
 */
import { describe, it, expect } from 'vitest'
import { formatTime } from '@renderer/utils/format'

describe('formatTime', () => {
  it('格式化 ISO 时间字符串', () => {
    const result = formatTime('2026-04-05T14:30:00.000Z')
    /* 不同时区结果不同，只验证格式：HH:MM */
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('格式化 SQLite datetime 格式', () => {
    const result = formatTime('2026-04-05 22:13:08')
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('输出只包含时和分', () => {
    const result = formatTime('2026-01-01T00:00:00')
    /* 不应包含秒 */
    const parts = result.split(':')
    expect(parts).toHaveLength(2)
  })
})
