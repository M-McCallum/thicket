import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConversationList from '../ConversationList'
import { useDMStore } from '../../../stores/dmStore'
import { useAuthStore } from '../../../stores/authStore'

vi.mock('../../../services/api', () => ({
  dm: {
    createConversation: vi.fn(),
    listConversations: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn(),
    sendMessage: vi.fn()
  },
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
    on: vi.fn(() => vi.fn()),
    send: vi.fn()
  }
}))

const mockConversations = [
  {
    id: 'conv-1',
    is_group: false,
    name: null,
    created_at: '2024-01-01T00:00:00Z',
    participants: [
      { id: 'user-1', username: 'alice', display_name: null, avatar_url: null, status: 'online' },
      { id: 'user-2', username: 'bob', display_name: 'Bob D', avatar_url: null, status: 'online' }
    ]
  },
  {
    id: 'conv-2',
    is_group: false,
    name: null,
    created_at: '2024-01-02T00:00:00Z',
    participants: [
      { id: 'user-1', username: 'alice', display_name: null, avatar_url: null, status: 'online' },
      {
        id: 'user-3',
        username: 'charlie',
        display_name: null,
        avatar_url: null,
        status: 'offline'
      }
    ]
  }
]

describe('ConversationList', () => {
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
  })

  it('renders empty state', () => {
    render(<ConversationList />)
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  it('renders conversation items with other participant name', () => {
    useDMStore.setState({ conversations: mockConversations })

    render(<ConversationList />)

    // Should show display_name when available (Bob D), username otherwise (charlie)
    expect(screen.getByText('Bob D')).toBeInTheDocument()
    expect(screen.getByText('charlie')).toBeInTheDocument()
  })

  it('highlights active conversation', () => {
    useDMStore.setState({
      conversations: mockConversations,
      activeConversationId: 'conv-1'
    })

    render(<ConversationList />)

    const buttons = screen.getAllByRole('button')
    expect(buttons[0].className).toContain('text-sol-amber')
    expect(buttons[1].className).not.toContain('text-sol-amber')
  })

  it('calls setActiveConversation on click', async () => {
    const { dm } = await import('../../../services/api')
    vi.mocked(dm.listConversations).mockResolvedValue(mockConversations)

    useDMStore.setState({ conversations: mockConversations })

    const user = userEvent.setup()
    render(<ConversationList />)

    const buttons = await screen.findAllByRole('button')
    await user.click(buttons[0])

    expect(useDMStore.getState().activeConversationId).toBe('conv-1')
  })
})
