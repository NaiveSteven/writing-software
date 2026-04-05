import { create } from 'zustand'
import type { LanguageCode } from '../types/language'

/** 设置状态定义 */
interface SettingState {
  /** 是否启用翻译 */
  translateEnabled: boolean
  /** 翻译目标语言 */
  targetLang: LanguageCode
  /** 界面语言 */
  uiLang: 'zh-CN' | 'en-US'

  /** 切换翻译开关 */
  toggleTranslate: () => void
  /** 设置目标语言 */
  setTargetLang: (lang: LanguageCode) => void
  /** 设置界面语言 */
  setUiLang: (lang: 'zh-CN' | 'en-US') => void
}

/**
 * 设置状态管理
 * 管理翻译开关、目标语言、界面语言等用户偏好
 */
export const useSettingStore = create<SettingState>((set) => ({
  translateEnabled: false,
  targetLang: 'en',
  uiLang: 'zh-CN',

  toggleTranslate: () => set((s) => ({ translateEnabled: !s.translateEnabled })),
  setTargetLang: (lang) => set({ targetLang: lang }),
  setUiLang: (lang) => set({ uiLang: lang })
}))
