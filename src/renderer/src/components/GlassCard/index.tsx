import React from 'react'
import styles from './GlassCard.module.css'

/** GlassCard 属性 */
interface GlassCardProps {
  children: React.ReactNode
  className?: string
  /** 是否可悬停高亮 */
  hoverable?: boolean
  /** 点击回调 */
  onClick?: () => void
}

/**
 * 液态玻璃卡片容器
 * 半透明毛玻璃效果，支持悬停和点击交互
 */
export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hoverable = false,
  onClick
}) => {
  return (
    <div
      className={`${styles.card} ${hoverable ? styles.hoverable : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  )
}
