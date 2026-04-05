import React from 'react'
import styles from './ToggleSwitch.module.css'

/** ToggleSwitch 属性 */
interface ToggleSwitchProps {
  /** 开关状态 */
  checked: boolean
  /** 状态变更回调 */
  onChange: () => void
  /** 开启时的标签 */
  labelOn?: string
  /** 关闭时的标签 */
  labelOff?: string
  /** 是否禁用 */
  disabled?: boolean
}

/**
 * iOS 风格滑动开关
 * 液态玻璃轨道 + 弹性滑块动画
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  labelOn,
  labelOff,
  disabled = false
}) => {
  const label = checked ? labelOn : labelOff

  return (
    <button
      type="button"
      className={styles.wrapper}
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
    >
      {/* 滑动轨道 */}
      <span className={`${styles.track} ${checked ? styles.trackOn : ''}`}>
        <span className={`${styles.thumb} ${checked ? styles.thumbOn : ''}`} />
      </span>
      {/* 文字标签 */}
      {label && (
        <span className={`${styles.label} ${checked ? styles.labelOn : ''}`}>
          {label}
        </span>
      )}
    </button>
  )
}
