/**
 * GlassButton 组件测试
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlassButton } from '@renderer/components/GlassButton'

describe('GlassButton', () => {
  it('渲染按钮文字', () => {
    render(<GlassButton>发送</GlassButton>)
    expect(screen.getByRole('button')).toHaveTextContent('发送')
  })

  it('点击触发回调', () => {
    const onClick = vi.fn()
    render(<GlassButton onClick={onClick}>点我</GlassButton>)

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('禁用状态下不触发回调', () => {
    const onClick = vi.fn()
    render(<GlassButton onClick={onClick} disabled>点我</GlassButton>)

    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()

    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('默认 type 为 button', () => {
    render(<GlassButton>按钮</GlassButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('可设置 type 为 submit', () => {
    render(<GlassButton type="submit">提交</GlassButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
