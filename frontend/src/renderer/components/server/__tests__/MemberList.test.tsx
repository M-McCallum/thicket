import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MemberList from '../MemberList'
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

describe('MemberList', () => {
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

  it('renders online members with count', () => {
    useServerStore.setState({
      members: [
        { id: 'u1', username: 'alice', display_name: null, avatar_url: null, status: 'online', role: 'owner' as const, nickname: null },
        { id: 'u2', username: 'bob', display_name: null, avatar_url: null, status: 'online', role: 'member' as const, nickname: null }
      ]
    })

    render(<MemberList />)

    // The em dash in the component is "—" (U+2014)
    expect(screen.getByText(/Online/)).toHaveTextContent('Online — 2')
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('renders offline members with count', () => {
    useServerStore.setState({
      members: [
        { id: 'u1', username: 'charlie', display_name: null, avatar_url: null, status: 'offline', role: 'member' as const, nickname: null }
      ]
    })

    render(<MemberList />)
    expect(screen.getByText(/Offline/)).toHaveTextContent('Offline — 1')
  })

  it('separates online and offline correctly', () => {
    useServerStore.setState({
      members: [
        { id: 'u1', username: 'alice', display_name: null, avatar_url: null, status: 'online', role: 'owner' as const, nickname: null },
        { id: 'u2', username: 'bob', display_name: null, avatar_url: null, status: 'online', role: 'member' as const, nickname: null },
        { id: 'u3', username: 'charlie', display_name: null, avatar_url: null, status: 'offline', role: 'member' as const, nickname: null }
      ]
    })

    render(<MemberList />)
    expect(screen.getByText(/Online/)).toHaveTextContent('Online — 2')
    expect(screen.getByText(/Offline/)).toHaveTextContent('Offline — 1')
  })

  it('displays display_name over username', () => {
    useServerStore.setState({
      members: [
        { id: 'u1', username: 'alice', display_name: 'Alice Wonderland', avatar_url: null, status: 'online', role: 'member' as const, nickname: null }
      ]
    })

    render(<MemberList />)
    expect(screen.getByText('Alice Wonderland')).toBeInTheDocument()
    expect(screen.queryByText('alice')).not.toBeInTheDocument()
  })

  it('renders avatar initial', () => {
    useServerStore.setState({
      members: [
        { id: 'u1', username: 'alice', display_name: 'Alice', avatar_url: null, status: 'online', role: 'member' as const, nickname: null }
      ]
    })

    render(<MemberList />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('treats idle/dnd as online', () => {
    useServerStore.setState({
      members: [
        { id: 'u1', username: 'alice', display_name: null, avatar_url: null, status: 'idle', role: 'member' as const, nickname: null },
        { id: 'u2', username: 'bob', display_name: null, avatar_url: null, status: 'dnd', role: 'member' as const, nickname: null }
      ]
    })

    render(<MemberList />)
    expect(screen.getByText(/Online/)).toHaveTextContent('Online — 2')
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument()
  })

  it('renders empty state', () => {
    useServerStore.setState({ members: [] })

    render(<MemberList />)
    expect(screen.queryByText(/Online/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument()
  })
})
