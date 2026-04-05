import { create } from 'zustand'
import type { LanguageCode } from '../types/language'

/** 主题类型 */
type ThemeMode = 'light' | 'dark'

/** 设置状态定义 */
interface SettingState {
  /** 是否启用翻译 */
  translateEnabled: boolean
  /** 翻译目标语言 */
  targetLang: LanguageCode
  /** 界面语言 */
  uiLang: 'zh-CN' | 'en-US'
  /** 外观主题 */
  theme: ThemeMode

  /** 切换翻译开关 */
  toggleTranslate: () => void
  /** 设置目标语言 */
  setTargetLang: (lang: LanguageCode) => void
  /** 设置界面语言 */
  setUiLang: (lang: 'zh-CN' | 'en-US') => void
  /** 切换亮/暗主题 */
  toggleTheme: () => void
  /** 设置主题 */
  setTheme: (theme: ThemeMode) => void
}

/**
 * 获取系统偏好的主题
 * 优先使用系统深色模式检测
 */
const getSystemTheme = (): ThemeMode => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/**
 * 设置状态管理
 * 管理翻译开关、目标语言、界面语言、主题等用户偏好
 */
export const useSettingStore = create<SettingState>((set) => ({
  translateEnabled: false,
  targetLang: 'en',
  uiLang: 'zh-CN',
  theme: getSystemTheme(),

  toggleTranslate: () => set((s) => ({ translateEnabled: !s.translateEnabled })),
  setTargetLang: (lang) => set({ targetLang: lang }),
  setUiLang: (lang) => set({ uiLang: lang }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setTheme: (theme) => set({ theme })
}))
