import { create } from 'zustand'
import type { ModelInfo, ModelStatus } from '../types/model'

/** 模型状态定义 */
interface ModelState {
  /** 所有模型信息 */
  models: Record<string, ModelInfo>

  /** 更新模型状态 */
  setModelStatus: (id: string, status: ModelStatus, progress?: number) => void
  /** 初始化模型信息 */
  initModel: (id: string, name: string) => void
}

/**
 * 模型状态管理
 * 跟踪语音识别和翻译模型的下载状态
 */
export const useModelStore = create<ModelState>((set, get) => ({
  models: {},

  initModel: (id, name) => {
    const models = get().models
    if (!models[id]) {
      set({
        models: {
          ...models,
          [id]: { id, name, status: 'not-downloaded', progress: 0 }
        }
      })
    }
  },

  setModelStatus: (id, status, progress) => {
    const models = get().models
    const existing = models[id]
    if (existing) {
      set({
        models: {
          ...models,
          [id]: { ...existing, status, progress: progress ?? existing.progress }
        }
      })
    }
  }
}))
