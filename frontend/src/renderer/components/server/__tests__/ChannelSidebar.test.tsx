import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChannelSidebar from '../ChannelSidebar'
import { useServerStore } from '../../../stores/serverStore'

vi.mock('../../../services/api', () => ({
  servers: { list: vi.fn(), create: vi.fn(), join: vi.fn(), members: vi.fn() },
  channels: { list: vi.fn(), create: vi.fn() },
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

describe('ChannelSidebar', () => {
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
    vi.clearAllMocks()
  })

  it('renders active server name', () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'My Server', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' }],
      activeServerId: 's1'
    })

    render(<ChannelSidebar />)
    expect(screen.getByText('My Server')).toBeInTheDocument()
  })

  it('renders "Server" when no active server', () => {
    render(<ChannelSidebar />)
    expect(screen.getByText('Server')).toBeInTheDocument()
  })

  it('renders text channels', () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'Srv', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' }],
      activeServerId: 's1',
      channels: [
        { id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' },
        { id: 'c2', server_id: 's1', name: 'random', type: 'text' as const, position: 1, created_at: '' }
      ]
    })

    render(<ChannelSidebar />)
    expect(screen.getByText('Text Channels')).toBeInTheDocument()
    expect(screen.getByText('general')).toBeInTheDocument()
    expect(screen.getByText('random')).toBeInTheDocument()
  })

  it('renders voice channels', () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'Srv', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' }],
      activeServerId: 's1',
      channels: [
        { id: 'c3', server_id: 's1', name: 'voice-chat', type: 'voice' as const, position: 0, created_at: '' }
      ]
    })

    render(<ChannelSidebar />)
    expect(screen.getByText('Voice Channels')).toBeInTheDocument()
    expect(screen.getByText('voice-chat')).toBeInTheDocument()
  })

  it('hides empty sections', () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'Srv', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' }],
      activeServerId: 's1',
      channels: [
        { id: 'c3', server_id: 's1', name: 'voice-only', type: 'voice' as const, position: 0, created_at: '' }
      ]
    })

    render(<ChannelSidebar />)
    expect(screen.queryByText('Text Channels')).not.toBeInTheDocument()
    expect(screen.getByText('Voice Channels')).toBeInTheDocument()
  })

  it('highlights active channel', () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'Srv', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' }],
      activeServerId: 's1',
      channels: [
        { id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' },
        { id: 'c2', server_id: 's1', name: 'random', type: 'text' as const, position: 1, created_at: '' }
      ],
      activeChannelId: 'c1'
    })

    render(<ChannelSidebar />)

    const generalButton = screen.getByText('general').closest('button')!
    expect(generalButton.className).toContain('text-neon-cyan')

    const randomButton = screen.getByText('random').closest('button')!
    expect(randomButton.className).not.toContain('text-neon-cyan')
  })

  it('clicking channel updates activeChannelId', async () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'Srv', icon_url: null, owner_id: 'o1', invite_code: 'abc', created_at: '' }],
      activeServerId: 's1',
      channels: [
        { id: 'c1', server_id: 's1', name: 'general', type: 'text' as const, position: 0, created_at: '' },
        { id: 'c2', server_id: 's1', name: 'random', type: 'text' as const, position: 1, created_at: '' }
      ],
      activeChannelId: 'c1'
    })

    const user = userEvent.setup()
    render(<ChannelSidebar />)

    await user.click(screen.getByText('random'))

    expect(useServerStore.getState().activeChannelId).toBe('c2')
  })

  it('renders invite code', () => {
    useServerStore.setState({
      servers: [{ id: 's1', name: 'Srv', icon_url: null, owner_id: 'o1', invite_code: 'INVITE-XYZ', created_at: '' }],
      activeServerId: 's1'
    })

    render(<ChannelSidebar />)
    expect(screen.getByText('INVITE CODE')).toBeInTheDocument()
    expect(screen.getByText('INVITE-XYZ')).toBeInTheDocument()
  })

  it('hides invite code with no active server', () => {
    render(<ChannelSidebar />)
    expect(screen.queryByText('INVITE CODE')).not.toBeInTheDocument()
  })
})
