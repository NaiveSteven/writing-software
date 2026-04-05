import React, { useRef, useEffect } from 'react'
import styles from './Chat.module.css'
import type { Message } from '../../types/message'
import type { LanguageCode } from '../../types/language'
import { MessageBubble } from '../../components/MessageBubble'
import { useTranslation } from 'react-i18next'

/** MessageList 属性 */
interface MessageListProps {
  messages: Message[]
  /** 是否显示翻译 */
  showTranslation: boolean
  /** 重新翻译回调 */
  onRetranslate: (id: number, targetLang: LanguageCode) => void
}

/**
 * 消息列表组件
 * 可滚动的历史消息容器，自动滚动到底部
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  showTranslation,
  onRetranslate
}) => {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)

  /* 新消息到达时自动滚动到底部 */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* 空状态 */
  if (messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>💬</div>
        <p className={styles.emptyText}>{t('chat.emptyState')}</p>
      </div>
    )
  }

  return (
    <div className={styles.messageList}>
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          showTranslation={showTranslation}
          onRetranslate={onRetranslate}
        />
      ))}
      {/* 滚动锚点 */}
      <div ref={bottomRef} />
    </div>
  )
}
