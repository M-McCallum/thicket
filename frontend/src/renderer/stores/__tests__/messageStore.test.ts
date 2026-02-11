import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMessageStore } from '../messageStore'
import type { Message } from '../../types/models'

vi.mock('../../services/api', () => ({
  messages: {
    list: vi.fn(),
    send: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOnTokenRefresh: vi.fn()
}))

const mockMessage: Message = {
  id: 'msg-1',
  channel_id: 'ch-1',
  author_id: 'user-1',
  content: 'Hello, World!',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  author_username: 'testuser'
}

describe('messageStore', () => {
  beforeEach(() => {
    useMessageStore.setState({
      messages: [],
      isLoading: false,
      hasMore: true
    })
    vi.clearAllMocks()
  })

  it('should have correct initial state', () => {
    const state = useMessageStore.getState()
    expect(state.messages).toEqual([])
    expect(state.isLoading).toBe(false)
    expect(state.hasMore).toBe(true)
  })

  it('should add a message to the beginning', () => {
    useMessageStore.getState().addMessage(mockMessage)
    const state = useMessageStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].id).toBe('msg-1')
  })

  it('should add multiple messages in order', () => {
    const msg2: Message = { ...mockMessage, id: 'msg-2', content: 'Second' }
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().addMessage(msg2)

    const state = useMessageStore.getState()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].id).toBe('msg-2') // Most recent first
  })

  it('should update a message', () => {
    useMessageStore.getState().addMessage(mockMessage)
    const updated = { ...mockMessage, content: 'Updated content' }

    useMessageStore.getState().updateMessage(updated)

    const state = useMessageStore.getState()
    expect(state.messages[0].content).toBe('Updated content')
  })

  it('should remove a message', () => {
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().removeMessage('msg-1')

    const state = useMessageStore.getState()
    expect(state.messages).toHaveLength(0)
  })

  it('should clear all messages', () => {
    useMessageStore.getState().addMessage(mockMessage)
    useMessageStore.getState().addMessage({ ...mockMessage, id: 'msg-2' })
    useMessageStore.getState().clearMessages()

    const state = useMessageStore.getState()
    expect(state.messages).toHaveLength(0)
    expect(state.hasMore).toBe(true)
  })

  it('should fetch messages', async () => {
    const { messages: messagesApi } = await import('../../services/api')
    vi.mocked(messagesApi.list).mockResolvedValue([mockMessage])

    await useMessageStore.getState().fetchMessages('ch-1')

    const state = useMessageStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.isLoading).toBe(false)
    expect(state.hasMore).toBe(false) // Less than 50 messages
  })

  it('should set hasMore true when 50 messages returned', async () => {
    const { messages: messagesApi } = await import('../../services/api')
    const fiftyMessages = Array.from({ length: 50 }, (_, i) => ({
      ...mockMessage,
      id: `msg-${i}`
    }))
    vi.mocked(messagesApi.list).mockResolvedValue(fiftyMessages)

    await useMessageStore.getState().fetchMessages('ch-1')

    expect(useMessageStore.getState().hasMore).toBe(true)
  })
})
