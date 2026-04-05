import React from 'react'
import styles from './GlassInput.module.css'

/** GlassInput 属性 */
interface GlassInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** 回车键回调 */
  onSubmit?: () => void
  /** 是否禁用 */
  disabled?: boolean
  /** 是否多行文本 */
  multiline?: boolean
}

/**
 * 液态玻璃输入框
 * 半透明毛玻璃背景，支持单行/多行模式
 */
export const GlassInput: React.FC<GlassInputProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  onSubmit,
  disabled = false,
  multiline = false
}) => {
  /** 键盘事件处理 */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    /* Enter 发送，Shift+Enter 换行 */
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  if (multiline) {
    return (
      <textarea
        className={`${styles.input} ${styles.textarea} ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />
    )
  }

  return (
    <input
      type="text"
      className={`${styles.input} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
