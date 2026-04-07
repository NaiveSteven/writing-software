/**
 * 翻译服务单元测试
 * 验证语言对映射、模型 ID 解析、缓存检查逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  EAST_ASIA_MODEL_ID,
  MODEL_MAP,
  getRequiredModelIds,
  isTranslatePairSupported,
  areTranslateModelsCached,
  getAllTranslateModelStatus,
  isModelLoaded
} from '../../src/renderer/src/services/translate'

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
    it('静态 Marian 映射保留 12 个语言对模型', () => {
      expect(Object.keys(MODEL_MAP).length).toBe(12)
    })

    it('每个静态语言对的模型 ID 都来自已验证的 Marian ONNX 仓库', () => {
      for (const modelId of Object.values(MODEL_MAP)) {
        expect(modelId).toMatch(/^Xenova\/opus-mt-/)
      }
    })

    it('包含中英双向翻译', () => {
      expect(MODEL_MAP['en-zh']).toBe('Xenova/opus-mt-en-zh')
      expect(MODEL_MAP['zh-en']).toBe('Xenova/opus-mt-zh-en')
    })

    it('日韩方向不再依赖旧的 OPUS 静态映射', () => {
      expect(MODEL_MAP['en-ja']).toBeUndefined()
      expect(MODEL_MAP['en-ko']).toBeUndefined()
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

    it('日语和韩语相关方向优先使用 NLLB 直译', () => {
      const ids = getRequiredModelIds('zh', 'ja')
      expect(ids).toEqual([EAST_ASIA_MODEL_ID])
    })

    it('en 到常规直译语言只需 1 个模型', () => {
      const langs = ['zh', 'fr', 'de', 'ru', 'es', 'it']
      for (const lang of langs) {
        expect(getRequiredModelIds('en', lang)).toHaveLength(1)
      }
    })

    it('英语到日语和韩语现在都走同一套增强模型', () => {
      expect(getRequiredModelIds('en', 'ja')).toEqual([EAST_ASIA_MODEL_ID])
      expect(getRequiredModelIds('en', 'ko')).toEqual([EAST_ASIA_MODEL_ID])
    })

    it('日语和韩语作为源语言可直接翻到当前支持语种', () => {
      expect(getRequiredModelIds('ko', 'zh')).toEqual([EAST_ASIA_MODEL_ID])
      expect(getRequiredModelIds('ja', 'fr')).toEqual([EAST_ASIA_MODEL_ID])
    })

    it('日语和韩语作为目标语言也优先直译', () => {
      expect(isTranslatePairSupported('en', 'ko')).toBe(true)
      expect(isTranslatePairSupported('zh', 'ko')).toBe(true)
      expect(getRequiredModelIds('zh', 'ko')).toEqual([EAST_ASIA_MODEL_ID])
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
        {
          url: 'https://huggingface.co/Xenova/opus-mt-en-zh/resolve/main/onnx/encoder_model_quantized.onnx'
        } as unknown as Request,
        {
          url: 'https://huggingface.co/Xenova/opus-mt-en-zh/resolve/main/onnx/decoder_model_merged_quantized.onnx'
        } as unknown as Request
      ])
      const result = await areTranslateModelsCached('en', 'zh')
      expect(result).toBe(true)
    })

    it('常规 Marian 中转翻译需要两个模型都缓存才返回 true', async () => {
      /* 只缓存了一个 */
      mockCacheKeys.mockResolvedValue([
        {
          url: 'https://huggingface.co/Xenova/opus-mt-fr-en/resolve/main/onnx/encoder_model_quantized.onnx'
        } as unknown as Request,
        {
          url: 'https://huggingface.co/Xenova/opus-mt-fr-en/resolve/main/onnx/decoder_model_merged_quantized.onnx'
        } as unknown as Request
      ])
      const result = await areTranslateModelsCached('fr', 'zh')
      expect(result).toBe(false)
    })

    it('NLLB 相关语言对只需一个模型缓存即可', async () => {
      mockCacheKeys.mockResolvedValue([
        {
          url: `https://huggingface.co/${EAST_ASIA_MODEL_ID}/resolve/main/onnx/encoder_model_quantized.onnx`
        } as unknown as Request,
        {
          url: `https://huggingface.co/${EAST_ASIA_MODEL_ID}/resolve/main/onnx/decoder_model_merged_quantized.onnx`
        } as unknown as Request
      ])
      const result = await areTranslateModelsCached('en', 'ko')
      expect(result).toBe(true)
    })
  })

  describe('getAllTranslateModelStatus', () => {
    it('返回去重后的模型列表', async () => {
      const models = await getAllTranslateModelStatus()
      expect(models.some((model) => model.modelId === EAST_ASIA_MODEL_ID)).toBe(true)
      expect(models.length).toBe(new Set(models.map((model) => model.modelId)).size)
    })

    it('每个模型都有 modelId、label、sizeHint、cached 字段', async () => {
      const models = await getAllTranslateModelStatus()
      for (const m of models) {
        expect(m).toHaveProperty('modelId')
        expect(m).toHaveProperty('label')
        expect(m).toHaveProperty('sizeHint')
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
