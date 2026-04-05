/**
 * MessageBubble 组件测试
 * 验证消息气泡的渲染逻辑：原文、译文、复制、重新翻译
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageBubble } from '@renderer/components/MessageBubble'
import type { Message } from '@renderer/types/message'

/** 测试用消息工厂 */
function createTestMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    content: 'Hello world',
    sourceLang: 'en',
    translatedText: null,
    targetLang: null,
    inputType: 'text',
    createdAt: '2026-04-05 10:00:00',
    updatedAt: '2026-04-05 10:00:00',
    ...overrides
  }
}

describe('MessageBubble', () => {
  it('显示原文内容', () => {
    const msg = createTestMessage({ content: '你好世界' })
    render(<MessageBubble message={msg} />)
    expect(screen.getByText('你好世界')).toBeInTheDocument()
  })

  it('显示语言检测标签', () => {
    const msg = createTestMessage({ sourceLang: 'en' })
    render(<MessageBubble message={msg} />)
    /* i18n mock 返回 key 本身 */
    expect(screen.getByText('chat.original')).toBeInTheDocument()
  })

  it('有译文时显示翻译区域', () => {
    const msg = createTestMessage({
      translatedText: '你好',
      targetLang: 'zh'
    })
    render(<MessageBubble message={msg} showTranslation />)
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByText('chat.translation')).toBeInTheDocument()
  })

  it('showTranslation=false 时不显示翻译', () => {
    const msg = createTestMessage({
      translatedText: '你好',
      targetLang: 'zh'
    })
    render(<MessageBubble message={msg} showTranslation={false} />)
    expect(screen.queryByText('你好')).not.toBeInTheDocument()
  })

  it('没有译文时不显示翻译区域', () => {
    const msg = createTestMessage()
    render(<MessageBubble message={msg} showTranslation />)
    expect(screen.queryByText('chat.translation')).not.toBeInTheDocument()
  })

  it('语音消息显示麦克风标识', () => {
    const msg = createTestMessage({ inputType: 'voice' })
    render(<MessageBubble message={msg} />)
    expect(screen.getByText('🎙')).toBeInTheDocument()
  })

  it('文字消息不显示麦克风标识', () => {
    const msg = createTestMessage({ inputType: 'text' })
    render(<MessageBubble message={msg} />)
    expect(screen.queryByText('🎙')).not.toBeInTheDocument()
  })

  it('点击重新翻译触发回调', () => {
    const onRetranslate = vi.fn()
    const msg = createTestMessage()
    render(
      <MessageBubble
        message={msg}
        showTranslation
        onRetranslate={onRetranslate}
      />
    )

    fireEvent.click(screen.getByText('chat.retranslate'))
    expect(onRetranslate).toHaveBeenCalledWith(1, 'en')
  })
})
