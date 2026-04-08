import { useEffect, useCallback, useRef } from 'react'
import { getShortcutPlatform, isVoiceShortcutInput } from '../utils/shortcut'

/**
 * 全局快捷键 Hook
 * 监听当前平台定义的语音快捷键
 */
export function useShortcuts(handlers: {
  /** 语音快捷键触发录音切换 */
  onVoiceToggle?: () => void
}): void {
  const lastTriggerAtRef = useRef(0)
  const shortcutPlatform = getShortcutPlatform()

  const triggerVoiceToggle = useCallback(() => {
    const now = Date.now()
    if (now - lastTriggerAtRef.current < 180) return
    lastTriggerAtRef.current = now
    handlers.onVoiceToggle?.()
  }, [handlers])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isVoiceShortcutInput({
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat
      }, shortcutPlatform)) {
        event.preventDefault()
        triggerVoiceToggle()
      }
    },
    [shortcutPlatform, triggerVoiceToggle]
  )

  useEffect(() => {
    const disposeVoiceShortcut = window.api.onVoiceShortcut?.(() => {
      triggerVoiceToggle()
    })

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      disposeVoiceShortcut?.()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, triggerVoiceToggle])
}
