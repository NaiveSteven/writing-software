import { useEffect, useCallback } from 'react'

/**
 * 全局快捷键 Hook
 * 监听 Ctrl/Cmd + Tab 等快捷键
 */
export function useShortcuts(handlers: {
  /** Ctrl/Cmd + Tab 触发语音录制 */
  onVoiceToggle?: () => void
}): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey

      /* Ctrl/Cmd + Tab → 语音录制切换 */
      if (isMod && event.key === 'Tab') {
        event.preventDefault()
        handlers.onVoiceToggle?.()
      }
    },
    [handlers]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
