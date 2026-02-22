import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MainLayout from '../MainLayout'
import { useServerStore } from '../../../stores/serverStore'
import { useAuthStore } from '../../../stores/authStore'

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/api')>()
  return {
    ...actual,
    servers: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), join: vi.fn(), members: vi.fn() },
    channels: { list: vi.fn(), create: vi.fn() },
    messages: { list: vi.fn().mockResolvedValue([]), send: vi.fn() },
    auth: { login: vi.fn(), signup: vi.fn(), logout: vi.fn() },
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

  it('shows DM area when no active server', () => {
    render(<MainLayout />)
    // When no server is active, DM chat area is rendered
    expect(screen.getByTitle('Direct Messages')).toBeInTheDocument()
  })

  it('always renders ServerSidebar', () => {
    render(<MainLayout />)
    expect(screen.getByTitle('Direct Messages')).toBeInTheDocument()
  })
})
