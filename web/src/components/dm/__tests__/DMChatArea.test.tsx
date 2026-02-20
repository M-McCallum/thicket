import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DMChatArea from '../DMChatArea'
import { useDMStore } from '../../../stores/dmStore'
import { useAuthStore } from '../../../stores/authStore'

const mockOn = vi.fn(() => vi.fn())

vi.mock('../../../services/api', () => ({
  dm: {
    createConversation: vi.fn(),
    listConversations: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue({})
  },
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
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: (...args: unknown[]) => mockOn(...args),
    send: vi.fn()
  }
}))

const mockConversation = {
  id: 'conv-1',
  is_group: false,
  name: null,
  created_at: '2024-01-01T00:00:00Z',
  participants: [
    { id: 'user-1', username: 'alice', display_name: null, avatar_url: null, status: 'online' },
    { id: 'user-2', username: 'bob', display_name: 'Bob D', avatar_url: null, status: 'online' }
  ]
}

describe('DMChatArea', () => {
  beforeEach(() => {
    useDMStore.setState({
      conversations: [],
      messages: [],
      activeConversationId: null,
      isLoading: false,
      hasMore: true
    })
    useAuthStore.setState({
      user: {
        id: 'user-1',
        username: 'alice',
        email: 'alice@test.com',
        avatar_url: null,
        display_name: null,
        status: 'online',
        created_at: ''
      },
      accessToken: null,
      refreshToken: null,
      isAuthenticated: true,
      isLoading: false,
      error: null
    })
    vi.clearAllMocks()
    mockOn.mockReturnValue(vi.fn())
  })

  it('shows "Select a conversation" with no activeConversationId', () => {
    render(<DMChatArea />)
    expect(screen.getByText('Select a conversation')).toBeInTheDocument()
  })

  it('renders header with participant name', () => {
    useDMStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation]
    })

    render(<DMChatArea />)
    expect(screen.getByText('Bob D')).toBeInTheDocument()
  })

  it('calls fetchMessages on conversation change', async () => {
    const { dm } = await import('../../../services/api')

    useDMStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation]
    })

    render(<DMChatArea />)

    await waitFor(() => {
      expect(dm.getMessages).toHaveBeenCalledWith('conv-1', undefined, 50)
    })
  })

  it('renders messages', async () => {
    const { dm } = await import('../../../services/api')
    const seedMessages = [
      {
        id: 'dm1',
        conversation_id: 'conv-1',
        author_id: 'user-1',
        content: 'Hello DM',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        author_username: 'alice'
      },
      {
        id: 'dm2',
        conversation_id: 'conv-1',
        author_id: 'user-2',
        content: 'Hi back',
        created_at: '2025-01-01T00:01:00Z',
        updated_at: '2025-01-01T00:01:00Z',
        author_username: 'bob'
      }
    ]
    vi.mocked(dm.getMessages).mockResolvedValue(seedMessages)

    useDMStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation]
    })

    render(<DMChatArea />)

    await waitFor(() => {
      expect(screen.getByText('Hello DM')).toBeInTheDocument()
    })
    expect(screen.getByText('Hi back')).toBeInTheDocument()
  })

  it('renders input with participant name placeholder', () => {
    useDMStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation]
    })

    render(<DMChatArea />)
    expect(screen.getByPlaceholderText('Message #Bob D')).toBeInTheDocument()
  })

  it('submitting sends message and clears input', async () => {
    const { dm } = await import('../../../services/api')
    vi.mocked(dm.sendMessage).mockResolvedValue({
      id: 'dm1',
      conversation_id: 'conv-1',
      author_id: 'user-1',
      content: 'Hey',
      created_at: '',
      updated_at: ''
    })

    useDMStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation]
    })

    const user = userEvent.setup()
    render(<DMChatArea />)

    const input = screen.getByPlaceholderText('Message #Bob D')
    await user.type(input, 'Hey')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(dm.sendMessage).toHaveBeenCalledWith('conv-1', { content: 'Hey' })
    })

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  it('registers DM_MESSAGE_CREATE handler', () => {
    useDMStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation]
    })

    render(<DMChatArea />)
    expect(mockOn).toHaveBeenCalledWith('DM_MESSAGE_CREATE', expect.any(Function))
  })

  it('cleans up WS handler on unmount', () => {
    const cleanup = vi.fn()
    mockOn.mockReturnValue(cleanup)

    useDMStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation]
    })

    const { unmount } = render(<DMChatArea />)
    unmount()

    expect(cleanup).toHaveBeenCalled()
  })
})
