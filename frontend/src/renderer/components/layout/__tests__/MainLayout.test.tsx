import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MainLayout from '../MainLayout'
import { useServerStore } from '../../../stores/serverStore'
import { useAuthStore } from '../../../stores/authStore'

vi.mock('../../../services/api', () => ({
  servers: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), join: vi.fn(), members: vi.fn() },
  channels: { list: vi.fn(), create: vi.fn() },
  messages: { list: vi.fn().mockResolvedValue([]), send: vi.fn() },
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

describe('MainLayout', () => {
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
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    })
    vi.clearAllMocks()
  })

  it('calls fetchServers on mount', async () => {
    const { servers } = await import('../../../services/api')

    render(<MainLayout />)

    await waitFor(() => {
      expect(servers.list).toHaveBeenCalled()
    })
  })

  it('shows placeholder when no active server', () => {
    render(<MainLayout />)
    expect(screen.getByText('Find Your Grove')).toBeInTheDocument()
  })

  it('shows content when server is active', () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'Test', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '', welcome_message: '', welcome_channels: [] }],
      activeServerId: 's1',
      channels: [{ id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '', topic: '', category_id: null, slow_mode_interval: 0, voice_status: '', is_announcement: false }],
      activeChannelId: 'c1'
    })

    render(<MainLayout />)
    // ChannelSidebar renders the server name
    expect(screen.getByText('Test')).toBeInTheDocument()
    // Channel name appears in both ChannelSidebar and ChatArea header
    expect(screen.getAllByText('general').length).toBeGreaterThanOrEqual(1)
  })

  it('always renders ServerSidebar', () => {
    render(<MainLayout />)
    expect(screen.getByTitle('Direct Messages')).toBeInTheDocument()
  })
})
