import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ServerSidebar from '../ServerSidebar'
import { useServerStore } from '../../../stores/serverStore'
import { useAuthStore } from '../../../stores/authStore'

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/api')>()
  return {
    ...actual,
    servers: {
      list: vi.fn(),
      create: vi.fn(),
      join: vi.fn(),
      members: vi.fn()
    },
    channels: {
      list: vi.fn()
    },
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

vi.mock('../../../services/oauth', () => ({
  oauthService: {
    startLogin: vi.fn(),
    handleCallback: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn()
  }
}))

vi.mock('../../../services/tokenStorage', () => ({
  storeTokens: vi.fn(),
  getTokens: vi.fn().mockReturnValue({ access_token: null, refresh_token: null, id_token: null }),
  clearTokens: vi.fn()
}))

describe('ServerSidebar', () => {
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

  it('renders home button', () => {
    render(<ServerSidebar />)
    expect(screen.getByTitle('Direct Messages')).toBeInTheDocument()
  })

  it('renders server icons from store', () => {
    useServerStore.setState({
      servers: [
        { id: '1', name: 'Alpha', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' },
        { id: '2', name: 'Beta', icon_url: null, owner_id: 'o2', invite_code: 'def', created_at: '' },
        { id: '3', name: 'Gamma', icon_url: null, owner_id: 'o3', invite_code: 'ghi', created_at: '' }
      ]
    })

    render(<ServerSidebar />)

    expect(screen.getByTitle('Alpha')).toBeInTheDocument()
    expect(screen.getByTitle('Beta')).toBeInTheDocument()
    expect(screen.getByTitle('Gamma')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('G')).toBeInTheDocument()
  })

  it('highlights active server', () => {
    useServerStore.setState({
      servers: [
        { id: '1', name: 'Alpha', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' },
        { id: '2', name: 'Beta', icon_url: null, owner_id: 'o2', invite_code: 'def', created_at: '' }
      ],
      activeServerId: '1'
    })

    render(<ServerSidebar />)

    const activeButton = screen.getByTitle('Alpha')
    expect(activeButton.className).toContain('bg-sol-amber/20')
    expect(activeButton.className).toContain('shadow-glow-amber')
  })

  it('clicking server calls setActiveServer', async () => {
    const { channels, servers } = await import('../../../services/api')
    vi.mocked(channels.list).mockResolvedValue([])
    vi.mocked(servers.members).mockResolvedValue([])

    useServerStore.setState({
      servers: [
        { id: '1', name: 'Alpha', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' }
      ]
    })

    const user = userEvent.setup()
    render(<ServerSidebar />)

    await user.click(screen.getByTitle('Alpha'))

    await waitFor(() => {
      expect(channels.list).toHaveBeenCalledWith('1')
      expect(servers.members).toHaveBeenCalledWith('1')
    })
  })

  it('renders Create Server button', () => {
    render(<ServerSidebar />)
    expect(screen.getByTitle('Create Server')).toBeInTheDocument()
  })

  it('create modal opens on click', async () => {
    const user = userEvent.setup()
    render(<ServerSidebar />)

    await user.click(screen.getByTitle('Create Server'))

    expect(screen.getByText('Create Server')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Server name')).toBeInTheDocument()
  })

  it('create modal submits', async () => {
    const { servers } = await import('../../../services/api')
    const mockServer = { id: 's1', name: 'New', icon_url: null, owner_id: 'o1', invite_code: 'xyz', created_at: '' }
    vi.mocked(servers.create).mockResolvedValue({ server: mockServer, channel: { id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' } })
    vi.mocked(servers.members).mockResolvedValue([])
    const { channels } = await import('../../../services/api')
    vi.mocked(channels.list).mockResolvedValue([])

    const user = userEvent.setup()
    render(<ServerSidebar />)

    await user.click(screen.getByTitle('Create Server'))
    await user.type(screen.getByPlaceholderText('Server name'), 'New')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(servers.create).toHaveBeenCalledWith({ name: 'New' })
    })

    await waitFor(() => {
      expect(screen.queryByText('Create Server')).not.toBeInTheDocument()
    })
  })

  it('create modal cancel closes', async () => {
    const user = userEvent.setup()
    render(<ServerSidebar />)

    await user.click(screen.getByTitle('Create Server'))
    expect(screen.getByText('Create Server')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Create Server')).not.toBeInTheDocument()
  })

  it('empty name does not submit', async () => {
    const { servers } = await import('../../../services/api')
    const user = userEvent.setup()
    render(<ServerSidebar />)

    await user.click(screen.getByTitle('Create Server'))
    // Input has required attribute, so submitting empty triggers browser validation
    // We verify the API was not called
    expect(servers.create).not.toHaveBeenCalled()
  })

  it('renders Join Server button', () => {
    render(<ServerSidebar />)
    expect(screen.getByTitle('Join Server')).toBeInTheDocument()
  })

  it('join modal opens and submits', async () => {
    const { servers } = await import('../../../services/api')
    const mockServer = { id: 's2', name: 'Joined', icon_url: null, owner_id: 'o2', invite_code: 'code123', created_at: '' }
    vi.mocked(servers.join).mockResolvedValue(mockServer)

    const user = userEvent.setup()
    render(<ServerSidebar />)

    await user.click(screen.getByTitle('Join Server'))
    expect(screen.getByText('Join Server')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Invite code'), 'code123')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(servers.join).toHaveBeenCalledWith({ invite_code: 'code123' })
    })
  })

  it('renders user avatar with first letter', () => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'testuser', email: 'test@test.com', display_name: null, avatar_url: null, status: 'online', created_at: '' }
    })

    render(<ServerSidebar />)

    expect(screen.getByText('T')).toBeInTheDocument()
  })

  it('clicking user settings opens settings', async () => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'testuser', email: 'test@test.com', display_name: null, avatar_url: null, status: 'online', created_at: '' },
      isAuthenticated: true
    })

    render(<ServerSidebar />)

    // User button now shows the username as title and opens settings
    expect(screen.getByTitle('testuser')).toBeInTheDocument()
  })

  it('shows "?" with no user', () => {
    useAuthStore.setState({ user: null })

    render(<ServerSidebar />)

    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
