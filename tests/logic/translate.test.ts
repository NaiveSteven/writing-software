/**
 * 翻译服务单元测试
 * 验证语言对映射、模型 ID 解析、缓存检查逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  MODEL_MAP,
  getRequiredModelIds,
  areTranslateModelsCached,
  getAllTranslateModelStatus,
  isModelLoaded
} from '@renderer/services/translate'

/* mock @huggingface/transformers（避免真实下载） */
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    backends: { onnx: { wasm: { proxy: false } } },
    remoteHost: '',
    allowLocalModels: true
  }
}))

/* mock Cache API */
const mockCacheKeys = vi.fn<() => Promise<Request[]>>().mockResolvedValue([])
const mockCacheDelete = vi.fn().mockResolvedValue(true)
const mockCacheOpen = vi.fn().mockResolvedValue({
  keys: mockCacheKeys,
  delete: mockCacheDelete
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

describe('translate service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheKeys.mockResolvedValue([])
    mockCachesKeys.mockResolvedValue(['transformers-cache'])
  })

  describe('MODEL_MAP', () => {
    it('包含 16 个语言对模型', () => {
      expect(Object.keys(MODEL_MAP).length).toBe(16)
    })

    it('每个语言对的模型 ID 以 Xenova/opus-mt 开头', () => {
      for (const modelId of Object.values(MODEL_MAP)) {
        expect(modelId).toMatch(/^Xenova\/opus-mt-/)
      }
    })

    it('包含中英双向翻译', () => {
      expect(MODEL_MAP['en-zh']).toBe('Xenova/opus-mt-en-zh')
      expect(MODEL_MAP['zh-en']).toBe('Xenova/opus-mt-zh-en')
    })
  })

  describe('getRequiredModelIds', () => {
    it('同语言返回空数组', () => {
      expect(getRequiredModelIds('en', 'en')).toEqual([])
    })

    it('直接翻译对返回 1 个模型', () => {
      const ids = getRequiredModelIds('en', 'zh')
      expect(ids).toEqual(['Xenova/opus-mt-en-zh'])
    })

    it('非直接翻译对需要 2 个模型中转', () => {
      const ids = getRequiredModelIds('zh', 'ja')
      expect(ids).toHaveLength(2)
      expect(ids).toContain('Xenova/opus-mt-zh-en')
      expect(ids).toContain('Xenova/opus-mt-en-jap')
    })

    it('en 到各语言只需 1 个模型', () => {
      const langs = ['zh', 'ja', 'ko', 'fr', 'de', 'ru', 'es', 'it']
      for (const lang of langs) {
        expect(getRequiredModelIds('en', lang)).toHaveLength(1)
      }
    })
  })

  describe('areTranslateModelsCached', () => {
    it('同语言视为已缓存', async () => {
      const result = await areTranslateModelsCached('en', 'en')
      expect(result).toBe(true)
    })

    it('Cache 中无模型时返回 false', async () => {
      mockCacheKeys.mockResolvedValue([])
      const result = await areTranslateModelsCached('en', 'zh')
      expect(result).toBe(false)
    })

    it('Cache 中有对应模型时返回 true', async () => {
      mockCacheKeys.mockResolvedValue([
        { url: 'https://huggingface.co/Xenova/opus-mt-en-zh/resolve/main/model.onnx' } as unknown as Request
      ])
      const result = await areTranslateModelsCached('en', 'zh')
      expect(result).toBe(true)
    })

    it('中转翻译需要两个模型都缓存才返回 true', async () => {
      /* 只缓存了一个 */
      mockCacheKeys.mockResolvedValue([
        { url: 'https://huggingface.co/Xenova/opus-mt-zh-en/resolve/main/model.onnx' } as unknown as Request
      ])
      const result = await areTranslateModelsCached('zh', 'ja')
      expect(result).toBe(false)
    })
  })

  describe('getAllTranslateModelStatus', () => {
    it('返回去重后的模型列表', async () => {
      const models = await getAllTranslateModelStatus()
      /* 16 个语言对中有 16 个唯一模型 */
      const uniqueModels = new Set(Object.values(MODEL_MAP))
      expect(models.length).toBe(uniqueModels.size)
    })

    it('每个模型都有 modelId、langPair、cached 字段', async () => {
      const models = await getAllTranslateModelStatus()
      for (const m of models) {
        expect(m).toHaveProperty('modelId')
        expect(m).toHaveProperty('langPair')
        expect(m).toHaveProperty('cached')
      }
    })
  })

  describe('isModelLoaded', () => {
    it('未加载的模型返回 false', () => {
      expect(isModelLoaded('en', 'zh')).toBe(false)
    })
  })
})
