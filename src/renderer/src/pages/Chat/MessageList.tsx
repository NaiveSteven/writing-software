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
  /** 当前正在翻译中的消息 ID 集合 */
  translatingIds?: Set<number>
}

/**
 * 消息列表组件
 * 可滚动的历史消息容器，自动滚动到底部
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onRetranslate,
  onMessageClick,
  onMessageContextMenu,
  translatingIds
}) => {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(0)
  const previousLastMessageIdRef = useRef<number | null>(null)

  /* 挂载时立即滚动到底部（返回聊天页场景） */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [])

  /* 仅在末尾新增消息时滚动，重译 / 编辑不打断当前阅读位置。 */
  useEffect(() => {
    const nextLastMessage = messages[messages.length - 1]
    const nextLastMessageId = nextLastMessage?.id ?? null
    const appendedNewMessage =
      messages.length > previousMessageCountRef.current &&
      nextLastMessageId !== previousLastMessageIdRef.current

    if (appendedNewMessage) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    previousMessageCountRef.current = messages.length
    previousLastMessageIdRef.current = nextLastMessageId
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
          isTranslating={translatingIds?.has(msg.id)}
        />
      ))}
      {/* 滚动锚点 */}
      <div ref={bottomRef} />
    </div>
  )
}
