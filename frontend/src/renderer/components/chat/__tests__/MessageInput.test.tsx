import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageInput from '../MessageInput'

describe('MessageInput', () => {
  it('renders placeholder with channel name', () => {
    render(<MessageInput channelName="general" onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument()
  })

  it('renders with different channel name', () => {
    render(<MessageInput channelName="random" onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText('Message #random')).toBeInTheDocument()
  })

  it('submit button disabled when empty', () => {
    render(<MessageInput channelName="general" onSend={vi.fn()} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('submit button enables when text entered', async () => {
    const user = userEvent.setup()
    render(<MessageInput channelName="general" onSend={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Message #general'), 'hello')
    expect(screen.getByRole('button')).toBeEnabled()
  })

  it('does not call onSend with empty input', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<MessageInput channelName="general" onSend={onSend} />)

    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not call onSend with whitespace-only input', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<MessageInput channelName="general" onSend={onSend} />)

    await user.type(screen.getByPlaceholderText('Message #general'), '   ')
    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('calls onSend with trimmed content', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MessageInput channelName="general" onSend={onSend} />)

    await user.type(screen.getByPlaceholderText('Message #general'), '  hello world  ')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('hello world')
  })

  it('clears input after successful send', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MessageInput channelName="general" onSend={onSend} />)

    const input = screen.getByPlaceholderText('Message #general')
    await user.type(input, 'hello')
    await user.keyboard('{Enter}')

    expect(input).toHaveValue('')
  })
})
