import React, { useEffect, useRef } from 'react'
import styles from './ContextMenu.module.css'

/** 菜单项定义 */
export interface MenuItem {
  /** 唯一标识 */
  key: string
  /** 显示文字 */
  label: string
  /** 图标（emoji 或短文本） */
  icon?: string
  /** 是否为危险操作 */
  danger?: boolean
  /** 点击回调 */
  onClick: () => void
}

/** ContextMenu 属性 */
interface ContextMenuProps {
  /** 坐标 x */
  x: number
  /** 坐标 y */
  y: number
  /** 菜单项 */
  items: MenuItem[]
  /** 关闭回调 */
  onClose: () => void
}

/**
 * 右键上下文菜单
 * 液态玻璃风格，点击外部或选择后自动关闭
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  /* 计算菜单位置，防止超出视口 */
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - 8
    const maxY = window.innerHeight - rect.height - 8

    menu.style.left = `${Math.min(x, maxX)}px`
    menu.style.top = `${Math.min(y, maxY)}px`
  }, [x, y])

  /** 处理菜单项点击 */
  const handleClick = (item: MenuItem): void => {
    item.onClick()
    onClose()
  }

  return (
    <>
      {/* 透明遮罩层，点击关闭菜单 */}
      <div className={styles.overlay} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      {/* 菜单主体 */}
      <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${styles.item} ${item.danger ? styles.danger : ''}`}
            onClick={() => handleClick(item)}
          >
            {item.icon && <span>{item.icon}</span>}
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
