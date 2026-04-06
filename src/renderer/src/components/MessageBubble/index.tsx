import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './MessageBubble.module.css'
import { TypewriterText } from '../TypewriterText'
import type { Message } from '../../types/message'
import type { LanguageCode } from '../../types/language'
import { LanguageSelector } from '../LanguageSelector'
import { formatTime, copyToClipboard } from '../../utils/format'

/** MessageBubble 属性 */
interface MessageBubbleProps {
  message: Message
  /** 重新翻译回调 */
  onRetranslate?: (id: number, targetLang: LanguageCode) => void
  /** 点击消息打开详情 */
  onClick?: (message: Message) => void
  /** 右键菜单回调 */
  onContextMenu?: (e: React.MouseEvent, message: Message) => void
}

/**
 * 消息气泡组件
 * 双栏布局: 原文左侧，译文右侧，通过标签和颜色区分
 * 始终显示已有译文，不受翻译开关影响
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onRetranslate,
  onClick,
  onContextMenu
}) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [retranslateLang, setRetranslateLang] = useState<LanguageCode>(
    message.targetLang || 'en'
  )

  /** 是否有译文需要展示（已有译文始终显示） */
  const hasTranslation = !!message.translatedText

  /** 复制文本到剪贴板 */
  const handleCopy = async (e: React.MouseEvent, text: string): Promise<void> => {
    e.stopPropagation()
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  /** 触发重新翻译 */
  const handleRetranslate = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onRetranslate?.(message.id, retranslateLang)
  }

  return (
    <div
      className={`${styles.bubble} ${onClick ? styles.clickable : ''}`}
      onClick={() => onClick?.(message)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e, message)
      }}
    >
      {/* 双栏主体 */}
      <div className={hasTranslation ? styles.dualColumn : undefined}>
        {/* 原文区域 */}
        <div className={styles.original}>
          <div className={styles.header}>
            <span className={styles.label}>{t('chat.original')}</span>
            <span className={styles.lang}>
              {t('chat.detected', { lang: t(`language.${message.sourceLang}`) })}
            </span>
            <span className={styles.time}>{formatTime(message.createdAt)}</span>
            {message.inputType === 'voice' && (
              <span className={styles.voiceTag}>🎙</span>
            )}
          </div>
          <p className={styles.content}>{message.content}</p>
        </div>

        {/* 译文区域 */}
        {hasTranslation && (
          <div className={styles.translation}>
            <div className={styles.header}>
              <span className={`${styles.label} ${styles.translationLabel}`}>
                {t('chat.translation')}
              </span>
              <span className={styles.lang}>
                → {t(`language.${message.targetLang}`)}
              </span>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={(e) => handleCopy(e, message.translatedText!)}
              >
                {copied ? t('chat.copied') : t('chat.copy')}
              </button>
            </div>
            <p className={styles.translatedContent}>
              <TypewriterText text={message.translatedText!} />
            </p>
          </div>
        )}
      </div>

      {/* 重新翻译操作栏 */}
      {onRetranslate && (
        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
          <LanguageSelector
            value={retranslateLang}
            onChange={setRetranslateLang}
          />
          <button
            type="button"
            className={styles.retranslateBtn}
            onClick={handleRetranslate}
          >
            {t('chat.retranslate')}
          </button>
        </div>
      )}
    </div>
  )
}
