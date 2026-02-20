import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatArea from '../ChatArea'
import { useServerStore } from '../../../stores/serverStore'
import { useMessageStore } from '../../../stores/messageStore'
import { useAuthStore } from '../../../stores/authStore'

const mockSubscribe = vi.fn()
const mockUnsubscribe = vi.fn()
const mockOn = vi.fn(() => vi.fn())

vi.mock('../../../services/api', () => ({
  servers: { list: vi.fn(), create: vi.fn(), join: vi.fn(), members: vi.fn() },
  channels: { list: vi.fn(), create: vi.fn() },
  messages: { list: vi.fn().mockResolvedValue([]), send: vi.fn().mockResolvedValue({}) },
  auth: { login: vi.fn(), signup: vi.fn(), logout: vi.fn() },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOnTokenRefresh: vi.fn()
}))

vi.mock('../../../services/ws', () => ({
  wsService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
    unsubscribe: (...args: unknown[]) => mockUnsubscribe(...args),
    on: (...args: unknown[]) => mockOn(...args),
    send: vi.fn()
  }
}))

describe('ChatArea', () => {
  beforeEach(() => {
    useServerStore.setState({
      servers: [],
      activeServerId: null,
      channels: [],
      activeChannelId: null,
      members: [],
      isLoading: false,
      error: null
    })
    useMessageStore.setState({
      messages: [],
      isLoading: false,
      hasMore: true
    })
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    })
    vi.clearAllMocks()
    mockOn.mockReturnValue(vi.fn())
  })

  it('shows "Select a channel" with no activeChannelId', () => {
    render(<ChatArea />)
    expect(screen.getByText('Select a channel')).toBeInTheDocument()
  })

  it('renders channel header with name', () => {
    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    render(<ChatArea />)
    expect(screen.getByText('general')).toBeInTheDocument()
  })

  it('calls fetchMessages on channel change', async () => {
    const { messages } = await import('../../../services/api')

    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    render(<ChatArea />)

    await waitFor(() => {
      expect(messages.list).toHaveBeenCalledWith('c1', undefined, 50)
    })
  })

  it('subscribes to WS channel', () => {
    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    render(<ChatArea />)
    expect(mockSubscribe).toHaveBeenCalledWith('c1')
  })

  it('unsubscribes on unmount', () => {
    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    const { unmount } = render(<ChatArea />)
    unmount()

    expect(mockUnsubscribe).toHaveBeenCalledWith('c1')
  })

  it('renders messages from store', async () => {
    const { messages: messagesApi } = await import('../../../services/api')
    const seedMessages = [
      { id: 'm1', channel_id: 'c1', author_id: 'u1', content: 'Hello', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', author_username: 'alice' },
      { id: 'm2', channel_id: 'c1', author_id: 'u2', content: 'World', created_at: '2025-01-01T00:01:00Z', updated_at: '2025-01-01T00:01:00Z', author_username: 'bob' },
      { id: 'm3', channel_id: 'c1', author_id: 'u1', content: 'Test', created_at: '2025-01-01T00:02:00Z', updated_at: '2025-01-01T00:02:00Z', author_username: 'alice' }
    ]
    vi.mocked(messagesApi.list).mockResolvedValue(seedMessages)

    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    render(<ChatArea />)

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument()
    })
    expect(screen.getByText('World')).toBeInTheDocument()
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('renders input with channel name placeholder', () => {
    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    render(<ChatArea />)
    expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument()
  })

  it('submitting sends message and clears input', async () => {
    const { messages } = await import('../../../services/api')
    vi.mocked(messages.send).mockResolvedValue({
      id: 'm1', channel_id: 'c1', author_id: 'u1', content: 'Hi', created_at: '', updated_at: ''
    })

    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    const user = userEvent.setup()
    render(<ChatArea />)

    const input = screen.getByPlaceholderText('Message #general')
    await user.type(input, 'Hi')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(messages.send).toHaveBeenCalledWith('c1', { content: 'Hi' })
    })

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  it('disabled send when input empty', () => {
    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    render(<ChatArea />)
    const submitButton = screen.getByRole('button')
    expect(submitButton).toBeDisabled()
  })

  it('registers MESSAGE_CREATE handler', () => {
    useServerStore.setState({
      activeChannelId: 'c1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' }]
    })

    render(<ChatArea />)
    expect(mockOn).toHaveBeenCalledWith('MESSAGE_CREATE', expect.any(Function))
  })
})
