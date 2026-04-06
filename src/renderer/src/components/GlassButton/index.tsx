import React from 'react'
import styles from './GlassButton.module.css'

/** GlassButton 属性 */
interface GlassButtonProps {
  children: React.ReactNode
  className?: string
  /** 按钮样式变体 */
  variant?: 'default' | 'primary' | 'secondary' | 'danger'
  /** 按钮尺寸 */
  size?: 'sm' | 'md' | 'lg'
  /** 是否禁用 */
  disabled?: boolean
  /** 点击回调 */
  onClick?: () => void
  /** 按钮类型 */
  type?: 'button' | 'submit'
}

/**
 * 液态玻璃按钮
 * 半透明背景 + 模糊效果，支持多种样式变体
 */
export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button'
}) => {
  return (
    <button
      type={type}
      className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
