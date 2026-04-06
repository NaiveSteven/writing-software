import React, { useState, useEffect, useRef } from 'react'

/** TypewriterText 属性 */
interface TypewriterTextProps {
  /** 最终要展示的全文 */
  text: string
  /** 每帧间隔(ms)，默认 15；实际每帧显示字符数由文本长度自适应 */
  speed?: number
  /** 自定义 class */
  className?: string
  /** 是否启用打字机效果 */
  enabled?: boolean
}

/**
 * 打字机效果文本组件
 * 逐字显示文本，模拟实时翻译输出
 * 根据文本长度自适应每帧显示字符数，确保长文本也能在 ~500ms 内完成
 * 仅在 text 变化时触发动画，避免重渲染时重复播放
 */
export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  speed = 15,
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

    /* 自适应：目标约 500ms 内完成，每帧 speed(15ms)
       charsPerTick = ceil(length / (500/speed)) = ceil(length / 33)
       短文本最少 1 字符/帧，长文本自动加速 */
    const charsPerTick = Math.max(1, Math.ceil(text.length / Math.round(500 / speed)))

    let index = 0
    setDisplayText('')

    timerRef.current = setInterval(() => {
      index += charsPerTick
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
