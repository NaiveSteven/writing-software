import React from 'react'
import { useTranslation } from 'react-i18next'
import styles from './VoiceButton.module.css'

/** VoiceButton 属性 */
interface VoiceButtonProps {
  /** 是否正在录音 */
  isRecording: boolean
  /** 录音时长(秒) */
  duration?: number
  /** 实时音量 (0~1) */
  volume?: number
  /** 点击回调 */
  onClick: () => void
  className?: string
}

/**
 * 语音录制按钮
 * 圆形液态玻璃按钮，录音时显示脉冲动画
 */
export const VoiceButton: React.FC<VoiceButtonProps> = ({
  isRecording,
  duration = 0,
  volume = 0,
  onClick,
  className = ''
}) => {
  const { t } = useTranslation()

  /** 格式化录音时长 */
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <button
      type="button"
      className={`${styles.voiceBtn} ${isRecording ? styles.recording : ''} ${className}`}
      onClick={onClick}
      title={isRecording ? t('chat.voiceStop') : t('chat.voiceStart')}
    >
      {/* 脉冲动画层 — 尺寸随音量动态缩放 */}
      {isRecording && (
        <>
          <span
            className={styles.pulse}
            style={{ transform: `scale(${1 + volume * 0.6})` }}
          />
          <span
            className={`${styles.pulse} ${styles.pulseDelay}`}
            style={{ transform: `scale(${1 + volume * 0.4})` }}
          />
        </>
      )}

      {/* 麦克风图标 */}
      <svg
        className={styles.icon}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>

      {/* 录音时长 */}
      {isRecording && (
        <span className={styles.duration}>{formatDuration(duration)}</span>
      )}
    </button>
  )
}
