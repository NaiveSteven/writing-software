/**
 * MessageList 组件测试
 * 验证消息列表渲染和空状态
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageList } from '@renderer/pages/Chat/MessageList'
import type { Message } from '@renderer/types/message'

/* mock scrollIntoView (jsdom 不支持) */
Element.prototype.scrollIntoView = vi.fn()

/** 生成测试消息列表 */
function createMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    content: `消息 ${i + 1}`,
    sourceLang: 'zh',
    translatedText: null,
    targetLang: null,
    inputType: 'text' as const,
    createdAt: `2026-04-05 10:0${i}:00`,
    updatedAt: `2026-04-05 10:0${i}:00`
  }))
}

describe('MessageList', () => {
  it('空消息列表显示空状态', () => {
    render(
      <MessageList
        messages={[]}
        showTranslation={false}
        onRetranslate={vi.fn()}
      />
    )
    expect(screen.getByText('chat.emptyState')).toBeInTheDocument()
    expect(screen.getByText('💬')).toBeInTheDocument()
  })

  it('渲染多条消息', () => {
    const msgs = createMessages(3)
    render(
      <MessageList
        messages={msgs}
        showTranslation={false}
        onRetranslate={vi.fn()}
      />
    )

    expect(screen.getByText('消息 1')).toBeInTheDocument()
    expect(screen.getByText('消息 2')).toBeInTheDocument()
    expect(screen.getByText('消息 3')).toBeInTheDocument()
  })

  it('新消息到达时调用 scrollIntoView', () => {
    const msgs = createMessages(1)
    render(
      <MessageList
        messages={msgs}
        showTranslation={false}
        onRetranslate={vi.fn()}
      />
    )
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
