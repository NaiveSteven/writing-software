/**
 * ChatInput 组件测试
 * 验证文字输入、发送、语音按钮集成
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from '@renderer/pages/Chat/ChatInput'

/* mock useAudioRecorder */
vi.mock('@renderer/hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    duration: 0,
    error: null,
    volume: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(null)
  })
}))

/** 共用默认 props */
const defaultProps = {
  onSendText: vi.fn(),
  onSendVoice: vi.fn(),
  translateEnabled: false,
  onToggleTranslate: vi.fn(),
  targetLang: 'en' as const,
  onTargetLangChange: vi.fn()
}

describe('ChatInput', () => {
  it('渲染输入框和发送按钮', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByPlaceholderText('chat.inputPlaceholder')).toBeInTheDocument()
    expect(screen.getByText('chat.send')).toBeInTheDocument()
  })

  it('空文本时发送按钮禁用', () => {
    render(<ChatInput {...defaultProps} />)
    const sendBtn = screen.getByText('chat.send').closest('button')
    expect(sendBtn).toBeDisabled()
  })

  it('输入文字后发送按钮可用', async () => {
    const user = userEvent.setup()
    render(<ChatInput {...defaultProps} />)

    await user.type(screen.getByPlaceholderText('chat.inputPlaceholder'), 'hello')
    const sendBtn = screen.getByText('chat.send').closest('button')
    expect(sendBtn).not.toBeDisabled()
  })

  it('点击发送调用 onSendText 并清空输入', async () => {
    const user = userEvent.setup()
    const onSendText = vi.fn()
    render(<ChatInput {...defaultProps} onSendText={onSendText} />)

    const input = screen.getByPlaceholderText('chat.inputPlaceholder')
    await user.type(input, 'hello world')
    fireEvent.click(screen.getByText('chat.send'))

    expect(onSendText).toHaveBeenCalledWith('hello world')
  })

  it('disabled 状态下输入框和按钮均禁用', () => {
    render(<ChatInput {...defaultProps} disabled />)
    expect(screen.getByPlaceholderText('chat.inputPlaceholder')).toBeDisabled()
  })

  it('显示快捷键提示', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByText(/chat\.shortcutHint/)).toBeInTheDocument()
  })
})
