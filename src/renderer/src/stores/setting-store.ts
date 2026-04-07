import { create } from 'zustand'
import type { InputSourceLang, LanguageCode } from '../types/language'
import {
  DEFAULT_WHISPER_MODEL_ID,
  type WhisperModelId
} from '../services/whisper-models'

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
  /** 输入源语言模式 */
  inputSourceLang: InputSourceLang
  /** 当前选中的语音识别模型 */
  speechModelId: WhisperModelId
  /** 外观主题 */
  theme: ThemeMode

  /** 切换翻译开关 */
  toggleTranslate: () => void
  /** 设置目标语言 */
  setTargetLang: (lang: LanguageCode) => void
  /** 设置界面语言 */
  setUiLang: (lang: 'zh-CN' | 'en-US') => void
  /** 设置输入源语言 */
  setInputSourceLang: (lang: InputSourceLang) => void
  /** 设置语音识别模型 */
  setSpeechModelId: (modelId: WhisperModelId) => void
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
  inputSourceLang: 'auto',
  speechModelId: DEFAULT_WHISPER_MODEL_ID,
  theme: getSystemTheme(),

  toggleTranslate: () => set((s) => ({ translateEnabled: !s.translateEnabled })),
  setTargetLang: (lang) => set({ targetLang: lang }),
  setUiLang: (lang) => set({ uiLang: lang }),
  setInputSourceLang: (inputSourceLang) => set({ inputSourceLang }),
  setSpeechModelId: (speechModelId) => set({ speechModelId }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setTheme: (theme) => set({ theme })
}))
