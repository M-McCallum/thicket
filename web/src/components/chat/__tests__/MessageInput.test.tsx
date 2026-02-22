import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageInput from '../MessageInput'
import { useServerStore } from '../../../stores/serverStore'
import { useAuthStore } from '../../../stores/authStore'
import { usePermissionStore } from '../../../stores/permissionStore'

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/api')>()
  return {
    ...actual,
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    setOAuthRefreshHandler: vi.fn(),
    setAuthFailureHandler: vi.fn()
  }
})

vi.mock('../../../services/ws', () => ({
  wsService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(() => vi.fn()),
    send: vi.fn()
  }
}))

describe('MessageInput', () => {
  beforeEach(() => {
    // Set up store state so the user is an owner (has all permissions)
    useAuthStore.setState({
      user: { id: 'u1', username: 'testuser' } as any,
      isAuthenticated: true
    })
    useServerStore.setState({
      servers: [{ id: 's1', owner_id: 'u1' } as any],
      activeServerId: 's1'
    })
    usePermissionStore.setState({
      roles: [],
      memberRoleIds: [],
      channelOverrides: []
    })
  })

  it('renders placeholder with channel name', () => {
    render(<MessageInput channelName="general" onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument()
  })

  it('renders with different channel name', () => {
    render(<MessageInput channelName="random" onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText('Message #random')).toBeInTheDocument()
  })

  it('calls onSend when text entered and Enter pressed', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MessageInput channelName="general" onSend={onSend} />)

    await user.type(screen.getByPlaceholderText('Message #general'), 'hello')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalled()
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
    expect(onSend).toHaveBeenCalled()
    expect(onSend.mock.calls[0][0]).toBe('hello world')
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
