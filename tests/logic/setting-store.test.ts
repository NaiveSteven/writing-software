/**
 * Zustand Store 测试
 * 验证 setting-store 的状态管理逻辑
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingStore } from '@renderer/stores/setting-store'

describe('useSettingStore', () => {
  beforeEach(() => {
    /* 重置 store 到初始状态 */
    useSettingStore.setState({
      translateEnabled: false,
      targetLang: 'en',
      uiLang: 'zh-CN',
      theme: 'light'
    })
  })

  it('初始状态正确', () => {
    const state = useSettingStore.getState()
    expect(state.translateEnabled).toBe(false)
    expect(state.targetLang).toBe('en')
    expect(state.uiLang).toBe('zh-CN')
    expect(state.theme).toBe('light')
  })

  it('toggleTranslate 切换翻译开关', () => {
    const { toggleTranslate } = useSettingStore.getState()

    toggleTranslate()
    expect(useSettingStore.getState().translateEnabled).toBe(true)

    toggleTranslate()
    expect(useSettingStore.getState().translateEnabled).toBe(false)
  })

  it('setTargetLang 设置目标语言', () => {
    useSettingStore.getState().setTargetLang('ja')
    expect(useSettingStore.getState().targetLang).toBe('ja')

    useSettingStore.getState().setTargetLang('zh')
    expect(useSettingStore.getState().targetLang).toBe('zh')
  })

  it('setUiLang 切换界面语言', () => {
    useSettingStore.getState().setUiLang('en-US')
    expect(useSettingStore.getState().uiLang).toBe('en-US')

    useSettingStore.getState().setUiLang('zh-CN')
    expect(useSettingStore.getState().uiLang).toBe('zh-CN')
  })

  it('toggleTheme 切换主题', () => {
    const { toggleTheme } = useSettingStore.getState()

    toggleTheme()
    expect(useSettingStore.getState().theme).toBe('dark')

    toggleTheme()
    expect(useSettingStore.getState().theme).toBe('light')
  })

  it('setTheme 直接设置主题', () => {
    useSettingStore.getState().setTheme('dark')
    expect(useSettingStore.getState().theme).toBe('dark')
  })
})
