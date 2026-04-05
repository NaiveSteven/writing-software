/**
 * VoiceButton 组件测试
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceButton } from '@renderer/components/VoiceButton'

describe('VoiceButton', () => {
  it('默认未录音状态渲染', () => {
    render(<VoiceButton isRecording={false} onClick={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('title', 'chat.voiceStart')
  })

  it('录音中状态渲染', () => {
    render(<VoiceButton isRecording duration={5} onClick={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('title', 'chat.voiceStop')
    /* 显示录音时长 */
    expect(screen.getByText('0:05')).toBeInTheDocument()
  })

  it('录音时长格式化正确', () => {
    render(<VoiceButton isRecording duration={125} onClick={vi.fn()} />)
    expect(screen.getByText('2:05')).toBeInTheDocument()
  })

  it('点击触发 onClick', () => {
    const onClick = vi.fn()
    render(<VoiceButton isRecording={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
