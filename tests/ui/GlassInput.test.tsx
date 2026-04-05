/**
 * GlassInput 组件测试
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlassInput } from '@renderer/components/GlassInput'

describe('GlassInput', () => {
  it('渲染输入框并显示占位文字', () => {
    render(
      <GlassInput value="" onChange={vi.fn()} placeholder="请输入..." />
    )
    expect(screen.getByPlaceholderText('请输入...')).toBeInTheDocument()
  })

  it('输入文字触发 onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GlassInput value="" onChange={onChange} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('Enter 键触发 onSubmit', () => {
    const onSubmit = vi.fn()
    render(
      <GlassInput value="hello" onChange={vi.fn()} onSubmit={onSubmit} />
    )

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('Shift+Enter 不触发 onSubmit', () => {
    const onSubmit = vi.fn()
    render(
      <GlassInput value="hello" onChange={vi.fn()} onSubmit={onSubmit} />
    )

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      shiftKey: true
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('multiline 渲染为 textarea', () => {
    render(
      <GlassInput value="" onChange={vi.fn()} multiline />
    )
    const el = screen.getByRole('textbox')
    expect(el.tagName).toBe('TEXTAREA')
  })

  it('非 multiline 渲染为 input', () => {
    render(
      <GlassInput value="" onChange={vi.fn()} />
    )
    const el = screen.getByRole('textbox')
    expect(el.tagName).toBe('INPUT')
  })

  it('禁用状态', () => {
    render(<GlassInput value="" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })
})
