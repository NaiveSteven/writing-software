import React, { useState, useEffect, useRef } from 'react'

/** TypewriterText 属性 */
interface TypewriterTextProps {
  /** 最终要展示的全文 */
  text: string
  /** 每个字符间隔(ms)，默认 30 */
  speed?: number
  /** 自定义 class */
  className?: string
  /** 是否启用打字机效果 */
  enabled?: boolean
}

/**
 * 打字机效果文本组件
 * 逐字显示文本，模拟实时翻译输出
 * 仅在 text 变化时触发动画，避免重渲染时重复播放
 */
export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  speed = 30,
  className = '',
  enabled = true
}) => {
  const [displayText, setDisplayText] = useState(enabled ? '' : text)
  const prevTextRef = useRef(text)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    /* 文本未变化，不重新播放 */
    if (text === prevTextRef.current && displayText === text) return

    /* 记录当前 text，用于下次比对 */
    prevTextRef.current = text

    /* 未启用打字机效果，直接展示 */
    if (!enabled) {
      setDisplayText(text)
      return
    }

    /* 清理旧计时器 */
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    let index = 0
    setDisplayText('')

    timerRef.current = setInterval(() => {
      index += 1
      if (index >= text.length) {
        setDisplayText(text)
        if (timerRef.current) clearInterval(timerRef.current)
        return
      }
      setDisplayText(text.slice(0, index))
    }, speed)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [text, speed, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return <span className={className}>{displayText}</span>
}
