import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDMStore } from '../dmStore'
import type { DMConversationWithParticipants, DMMessage } from '../../types/models'

vi.mock('../../services/api', () => ({
  dm: {
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOnTokenRefresh: vi.fn()
}))

const mockConversation: DMConversationWithParticipants = {
  id: 'conv-1',
  is_group: false,
  name: null,
  created_at: '2024-01-01T00:00:00Z',
  accepted: true,
  encrypted: false,
  participants: [
    { id: 'user-1', username: 'alice', display_name: null, avatar_url: null, status: 'online' },
    { id: 'user-2', username: 'bob', display_name: null, avatar_url: null, status: 'online' }
  ]
}

const mockMessage: DMMessage = {
  id: 'dm-msg-1',
  conversation_id: 'conv-1',
  author_id: 'user-1',
  content: 'Hello DM!',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  author_username: 'alice'
}

describe('dmStore', () => {
  beforeEach(() => {
    useDMStore.setState({
      conversations: [],
      messages: [],
      activeConversationId: null,
      isLoading: false,
      hasMore: true
    })
    vi.clearAllMocks()
  })

  it('should have correct initial state', () => {
    const state = useDMStore.getState()
    expect(state.conversations).toEqual([])
    expect(state.messages).toEqual([])
    expect(state.activeConversationId).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.hasMore).toBe(true)
  })

  it('should set active conversation', () => {
    useDMStore.getState().setActiveConversation('conv-1')
    expect(useDMStore.getState().activeConversationId).toBe('conv-1')
  })

  it('should fetch conversations', async () => {
    const { dm } = await import('../../services/api')
    vi.mocked(dm.listConversations).mockResolvedValue([mockConversation])

    await useDMStore.getState().fetchConversations()

    const state = useDMStore.getState()
    expect(state.conversations).toHaveLength(1)
    expect(state.conversations[0].id).toBe('conv-1')
    expect(state.isLoading).toBe(false)
  })

  it('should create conversation', async () => {
    const { dm } = await import('../../services/api')
    vi.mocked(dm.createConversation).mockResolvedValue(mockConversation)

    const conv = await useDMStore.getState().createConversation('user-2')

    expect(conv.id).toBe('conv-1')
    expect(useDMStore.getState().conversations).toHaveLength(1)
  })

  it('should dedup on create conversation', async () => {
    const { dm } = await import('../../services/api')
    vi.mocked(dm.createConversation).mockResolvedValue(mockConversation)

    // Pre-populate with existing conversation
    useDMStore.setState({ conversations: [mockConversation] })

    await useDMStore.getState().createConversation('user-2')

    // Should not duplicate
    expect(useDMStore.getState().conversations).toHaveLength(1)
  })

  it('should fetch messages', async () => {
    const { dm } = await import('../../services/api')
    vi.mocked(dm.getMessages).mockResolvedValue([mockMessage])

    await useDMStore.getState().fetchMessages('conv-1')

    const state = useDMStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.isLoading).toBe(false)
    expect(state.hasMore).toBe(false)
  })

  it('should append messages on paginated fetch', async () => {
    const { dm } = await import('../../services/api')
    const msg2: DMMessage = { ...mockMessage, id: 'dm-msg-2', content: 'Older' }
    vi.mocked(dm.getMessages).mockResolvedValue([msg2])

    useDMStore.setState({ messages: [mockMessage] })

    await useDMStore.getState().fetchMessages('conv-1', '2024-01-01T00:00:00Z')

    expect(useDMStore.getState().messages).toHaveLength(2)
  })

  it('should set hasMore true when 50 messages returned', async () => {
    const { dm } = await import('../../services/api')
    const fiftyMessages = Array.from({ length: 50 }, (_, i) => ({
      ...mockMessage,
      id: `dm-msg-${i}`
    }))
    vi.mocked(dm.getMessages).mockResolvedValue(fiftyMessages)

    await useDMStore.getState().fetchMessages('conv-1')

    expect(useDMStore.getState().hasMore).toBe(true)
  })

  it('should send message', async () => {
    const { dm } = await import('../../services/api')
    vi.mocked(dm.sendMessage).mockResolvedValue(mockMessage)

    await useDMStore.getState().sendMessage('conv-1', 'Hello DM!')

    expect(dm.sendMessage).toHaveBeenCalledWith('conv-1', { content: 'Hello DM!' })
  })

  it('should add message (WS)', () => {
    useDMStore.getState().addMessage(mockMessage)

    const state = useDMStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].id).toBe('dm-msg-1')
  })

  it('should add message to beginning', () => {
    const msg2: DMMessage = { ...mockMessage, id: 'dm-msg-2', content: 'Second' }
    useDMStore.getState().addMessage(mockMessage)
    useDMStore.getState().addMessage(msg2)

    const state = useDMStore.getState()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].id).toBe('dm-msg-2')
  })

  it('should clear messages', () => {
    useDMStore.getState().addMessage(mockMessage)
    useDMStore.getState().clearMessages()

    const state = useDMStore.getState()
    expect(state.messages).toHaveLength(0)
    expect(state.hasMore).toBe(true)
  })
})
