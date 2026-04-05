import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './MessageBubble.module.css'
import type { Message } from '../../types/message'
import type { LanguageCode } from '../../types/language'
import { LanguageSelector } from '../LanguageSelector'
import { formatTime, copyToClipboard } from '../../utils/format'

/** MessageBubble 属性 */
interface MessageBubbleProps {
  message: Message
  /** 重新翻译回调 */
  onRetranslate?: (id: number, targetLang: LanguageCode) => void
  /** 是否显示翻译区域 */
  showTranslation?: boolean
}

/**
 * 消息气泡组件
 * 显示原文 + 译文，支持复制和重新翻译
 * 原文和译文通过颜色与标签明确区分
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onRetranslate,
  showTranslation = true
}) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [retranslateLang, setRetranslateLang] = useState<LanguageCode>(
    message.targetLang || 'en'
  )

  /** 复制文本到剪贴板 */
  const handleCopy = async (text: string): Promise<void> => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  /** 触发重新翻译 */
  const handleRetranslate = (): void => {
    onRetranslate?.(message.id, retranslateLang)
  }

  return (
    <div className={styles.bubble}>
      {/* 原文区域 */}
      <div className={styles.original}>
        <div className={styles.header}>
          <span className={styles.label}>{t('chat.original')}</span>
          <span className={styles.lang}>
            {t('chat.detected', { lang: t(`language.${message.sourceLang}`) })}
          </span>
          <span className={styles.time}>{formatTime(message.createdAt)}</span>
          {/* 输入方式指示 */}
          {message.inputType === 'voice' && (
            <span className={styles.voiceTag}>🎙</span>
          )}
        </div>
        <p className={styles.content}>{message.content}</p>
      </div>

      {/* 译文区域 */}
      {showTranslation && message.translatedText && (
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
              onClick={() => handleCopy(message.translatedText!)}
            >
              {copied ? t('chat.copied') : t('chat.copy')}
            </button>
          </div>
          <p className={styles.translatedContent}>{message.translatedText}</p>
        </div>
      )}

      {/* 重新翻译操作栏 */}
      {showTranslation && onRetranslate && (
        <div className={styles.actions}>
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
