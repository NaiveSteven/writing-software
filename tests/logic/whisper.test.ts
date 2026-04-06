/**
 * Whisper 语音识别服务单元测试
 * 验证模型状态管理、缓存检查逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  WHISPER_MODEL_ID,
  getWhisperStatus,
  isWhisperCached
} from '@renderer/services/whisper'

/* mock @huggingface/transformers（避免真实下载） */
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    remoteHost: '',
    allowLocalModels: true
  }
}))

/* mock Cache API */
const mockCacheKeys = vi.fn<() => Promise<Request[]>>().mockResolvedValue([])
const mockCacheOpen = vi.fn().mockResolvedValue({
  keys: mockCacheKeys,
  delete: vi.fn().mockResolvedValue(true)
})
const mockCachesKeys = vi.fn<() => Promise<string[]>>().mockResolvedValue(['transformers-cache'])

Object.defineProperty(globalThis, 'caches', {
  value: {
    keys: mockCachesKeys,
    open: mockCacheOpen,
    delete: vi.fn()
  },
  writable: true
})

describe('whisper service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheKeys.mockResolvedValue([])
  })

  describe('WHISPER_MODEL_ID', () => {
    it('导出正确的模型 ID', () => {
      expect(WHISPER_MODEL_ID).toBe('onnx-community/whisper-tiny')
    })
  })

  describe('getWhisperStatus', () => {
    it('初始状态为 idle', () => {
      expect(getWhisperStatus()).toBe('idle')
    })
  })

  describe('isWhisperCached', () => {
    it('Cache 中无模型时返回 false', async () => {
      mockCacheKeys.mockResolvedValue([])
      const result = await isWhisperCached()
      expect(result).toBe(false)
    })

    it('Cache 中有模型文件时返回 true', async () => {
      mockCacheKeys.mockResolvedValue([
        { url: 'https://huggingface.co/onnx-community/whisper-tiny/resolve/main/model.onnx' } as unknown as Request
      ])
      const result = await isWhisperCached()
      expect(result).toBe(true)
    })

    it('Cache 中有 URL 编码的模型时也返回 true', async () => {
      mockCacheKeys.mockResolvedValue([
        { url: 'https://huggingface.co/onnx-community%2Fwhisper-tiny/resolve/main/model.onnx' } as unknown as Request
      ])
      const result = await isWhisperCached()
      expect(result).toBe(true)
    })

    it('caches API 不可用时返回 false', async () => {
      mockCachesKeys.mockRejectedValue(new Error('Not supported'))
      const result = await isWhisperCached()
      expect(result).toBe(false)
    })
  })
})
