import React, { useState, useEffect, useCallback } from 'react'
import styles from './Toast.module.css'

/** Toast 类型 */
export type ToastType = 'info' | 'success' | 'warning' | 'error'

/** 单条 Toast 数据 */
export interface ToastItem {
  /** 唯一 ID */
  id: string
  /** 消息文字 */
  message: string
  /** 类型 */
  type: ToastType
  /** 停留时长(ms)，默认 3000 */
  duration?: number
}

/** 类型对应图标 */
const ICON_MAP: Record<ToastType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
}

/** 生成唯一 ID */
let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `toast-${idCounter}-${Date.now()}`
}

/* ============================================
   全局 Toast 状态管理（无需额外依赖）
   通过发布-订阅模式驱动 React 组件更新
   ============================================ */

type Listener = () => void
let toasts: ToastItem[] = []
const listeners: Set<Listener> = new Set()

/** 通知所有监听者状态已变更 */
function emitChange(): void {
  listeners.forEach((fn) => fn())
}

/**
 * 弹出 Toast 通知
 * 全局调用，无需 context 或 props 传递
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration = 3000
): string {
  const id = nextId()
  toasts = [...toasts, { id, message, type, duration }]
  emitChange()
  return id
}

/** 移除指定 Toast */
export function removeToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id)
  emitChange()
}

/** 快捷方法 */
export const toast = {
  info: (msg: string, duration?: number) => showToast(msg, 'info', duration),
  success: (msg: string, duration?: number) => showToast(msg, 'success', duration),
  warning: (msg: string, duration?: number) => showToast(msg, 'warning', duration),
  error: (msg: string, duration?: number) => showToast(msg, 'error', duration)
}

/* ============================================
   单条 Toast 渲染组件
   ============================================ */

interface ToastItemViewProps {
  item: ToastItem
  onRemove: (id: string) => void
}

const ToastItemView: React.FC<ToastItemViewProps> = ({ item, onRemove }) => {
  const [exiting, setExiting] = useState(false)

  /* 自动消失计时 */
  useEffect(() => {
    const duration = item.duration ?? 3000
    if (duration <= 0) return

    const timer = setTimeout(() => {
      setExiting(true)
    }, duration)

    return () => clearTimeout(timer)
  }, [item.duration])

  /* 退出动画结束后真正移除 */
  const handleAnimationEnd = (): void => {
    if (exiting) {
      onRemove(item.id)
    }
  }

  return (
    <div
      className={`${styles.toast} ${styles[item.type]} ${exiting ? styles.toastOut : ''}`}
      onAnimationEnd={handleAnimationEnd}
    >
      <span className={styles.icon}>{ICON_MAP[item.type]}</span>
      <span className={styles.message}>{item.message}</span>
      <button
        type="button"
        className={styles.closeBtn}
        onClick={() => setExiting(true)}
      >
        ✕
      </button>
    </div>
  )
}

/* ============================================
   Toast 容器 — 放在 App 最外层即可
   ============================================ */

/**
 * Toast 容器组件
 * 放在 App 顶层渲染，自动收集全局 Toast 消息
 */
export const ToastContainer: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([])

  /* 订阅全局 Toast 状态 */
  useEffect(() => {
    const listener = (): void => setItems([...toasts])
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  /** 移除单条 */
  const handleRemove = useCallback((id: string) => {
    removeToast(id)
  }, [])

  if (items.length === 0) return null

  return (
    <div className={styles.container}>
      {items.map((item) => (
        <ToastItemView key={item.id} item={item} onRemove={handleRemove} />
      ))}
    </div>
  )
}
