import React, { useRef, useEffect } from 'react'
import styles from './Chat.module.css'
import type { Message } from '../../types/message'
import type { LanguageCode } from '../../types/language'
import { MessageBubble } from '../../components/MessageBubble'
import { useTranslation } from 'react-i18next'

/** MessageList 属性 */
interface MessageListProps {
  messages: Message[]
  /** 重新翻译回调 */
  onRetranslate: (id: number, targetLang: LanguageCode) => void
  /** 点击消息打开详情 */
  onMessageClick?: (message: Message) => void
  /** 右键菜单回调 */
  onMessageContextMenu?: (e: React.MouseEvent, message: Message) => void
}

/**
 * 消息列表组件
 * 可滚动的历史消息容器，自动滚动到底部
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onRetranslate,
  onMessageClick,
  onMessageContextMenu
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
          onRetranslate={onRetranslate}
          onClick={onMessageClick}
          onContextMenu={onMessageContextMenu}
        />
      ))}
      {/* 滚动锚点 */}
      <div ref={bottomRef} />
    </div>
  )
}
