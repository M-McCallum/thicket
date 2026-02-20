import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useServerStore } from '../serverStore'

vi.mock('../../services/api', () => ({
  servers: {
    list: vi.fn(),
    create: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    delete: vi.fn(),
    members: vi.fn()
  },
  channels: {
    list: vi.fn(),
    create: vi.fn()
  },
  auth: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOnTokenRefresh: vi.fn()
}))

describe('serverStore', () => {
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

  it('should have correct initial state', () => {
    const state = useServerStore.getState()
    expect(state.servers).toEqual([])
    expect(state.activeServerId).toBeNull()
    expect(state.channels).toEqual([])
    expect(state.activeChannelId).toBeNull()
    expect(state.members).toEqual([])
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should fetchServers success', async () => {
    const { servers } = await import('../../services/api')
    const mockServers = [
      { id: '1', name: 'Server 1', icon_url: null, owner_id: 'u1', invite_code: 'abc', created_at: '' }
    ]
    vi.mocked(servers.list).mockResolvedValue(mockServers as any)

    await useServerStore.getState().fetchServers()

    const state = useServerStore.getState()
    expect(servers.list).toHaveBeenCalled()
    expect(state.servers).toEqual(mockServers)
    expect(state.isLoading).toBe(false)
  })

  it('should fetchServers error', async () => {
    const { servers } = await import('../../services/api')
    vi.mocked(servers.list).mockRejectedValue(new Error('network error'))

    await useServerStore.getState().fetchServers()

    const state = useServerStore.getState()
    expect(state.error).toBe('network error')
    expect(state.isLoading).toBe(false)
  })

  it('should setActiveServer loads channels and members', async () => {
    const { servers, channels } = await import('../../services/api')
    const mockChannels = [
      { id: 'ch1', server_id: 's1', name: 'general', type: 'text', position: 0, created_at: '' },
      { id: 'ch2', server_id: 's1', name: 'voice', type: 'voice', position: 1, created_at: '' }
    ]
    const mockMembers = [
      { id: 'u1', username: 'user1', display_name: null, avatar_url: null, status: 'online', role: 'owner', nickname: null }
    ]
    vi.mocked(channels.list).mockResolvedValue(mockChannels as any)
    vi.mocked(servers.members).mockResolvedValue(mockMembers as any)

    await useServerStore.getState().setActiveServer('s1')

    const state = useServerStore.getState()
    expect(channels.list).toHaveBeenCalledWith('s1')
    expect(servers.members).toHaveBeenCalledWith('s1')
    expect(state.channels).toEqual(mockChannels)
    expect(state.members).toEqual(mockMembers)
    expect(state.activeChannelId).toBe('ch1') // first text channel
    expect(state.isLoading).toBe(false)
  })

  it('should setActiveServer with only voice channels', async () => {
    const { servers, channels } = await import('../../services/api')
    const mockChannels = [
      { id: 'ch1', server_id: 's1', name: 'voice', type: 'voice', position: 0, created_at: '' }
    ]
    vi.mocked(channels.list).mockResolvedValue(mockChannels as any)
    vi.mocked(servers.members).mockResolvedValue([])

    await useServerStore.getState().setActiveServer('s1')

    const state = useServerStore.getState()
    expect(state.activeChannelId).toBeNull()
  })

  it('should setActiveServer error', async () => {
    const { servers, channels } = await import('../../services/api')
    vi.mocked(channels.list).mockRejectedValue(new Error('load failed'))
    vi.mocked(servers.members).mockRejectedValue(new Error('load failed'))

    await useServerStore.getState().setActiveServer('s1')

    const state = useServerStore.getState()
    expect(state.error).toBe('load failed')
    expect(state.isLoading).toBe(false)
  })

  it('should setActiveChannel', () => {
    useServerStore.getState().setActiveChannel('ch99')
    expect(useServerStore.getState().activeChannelId).toBe('ch99')
  })

  it('should createServer', async () => {
    const { servers } = await import('../../services/api')
    const mockResult = {
      server: { id: 's1', name: 'New Server', icon_url: null, owner_id: 'u1', invite_code: 'abc', created_at: '' },
      channel: { id: 'ch1', server_id: 's1', name: 'general', type: 'text', position: 0, created_at: '' }
    }
    vi.mocked(servers.create).mockResolvedValue(mockResult as any)

    const result = await useServerStore.getState().createServer('New Server')

    expect(servers.create).toHaveBeenCalledWith({ name: 'New Server' })
    expect(result).toEqual(mockResult.server)
    expect(useServerStore.getState().servers).toHaveLength(1)
  })

  it('should joinServer', async () => {
    const { servers } = await import('../../services/api')
    const mockServer = { id: 's1', name: 'Joined', icon_url: null, owner_id: 'u2', invite_code: 'xyz', created_at: '' }
    vi.mocked(servers.join).mockResolvedValue(mockServer as any)

    await useServerStore.getState().joinServer('xyz')

    expect(servers.join).toHaveBeenCalledWith({ invite_code: 'xyz' })
    expect(useServerStore.getState().servers).toHaveLength(1)
  })

  it('should leaveServer', async () => {
    const { servers } = await import('../../services/api')
    vi.mocked(servers.leave).mockResolvedValue({ message: 'left' })

    useServerStore.setState({
      servers: [{ id: 's1', name: 'S1' } as any, { id: 's2', name: 'S2' } as any]
    })

    await useServerStore.getState().leaveServer('s1')

    expect(servers.leave).toHaveBeenCalledWith('s1')
    expect(useServerStore.getState().servers).toHaveLength(1)
    expect(useServerStore.getState().servers[0].id).toBe('s2')
  })

  it('should leaveServer clears active if leaving active', async () => {
    const { servers } = await import('../../services/api')
    vi.mocked(servers.leave).mockResolvedValue({ message: 'left' })

    useServerStore.setState({
      servers: [{ id: 's1', name: 'S1' } as any],
      activeServerId: 's1'
    })

    await useServerStore.getState().leaveServer('s1')

    expect(useServerStore.getState().activeServerId).toBeNull()
  })

  it('should deleteServer', async () => {
    const { servers } = await import('../../services/api')
    vi.mocked(servers.delete).mockResolvedValue({ message: 'deleted' })

    useServerStore.setState({
      servers: [{ id: 's1', name: 'S1' } as any]
    })

    await useServerStore.getState().deleteServer('s1')

    expect(servers.delete).toHaveBeenCalledWith('s1')
    expect(useServerStore.getState().servers).toHaveLength(0)
  })

  it('should deleteServer clears active if deleting active', async () => {
    const { servers } = await import('../../services/api')
    vi.mocked(servers.delete).mockResolvedValue({ message: 'deleted' })

    useServerStore.setState({
      servers: [{ id: 's1', name: 'S1' } as any],
      activeServerId: 's1'
    })

    await useServerStore.getState().deleteServer('s1')

    expect(useServerStore.getState().activeServerId).toBeNull()
  })

  it('should createChannel with activeServerId', async () => {
    const { channels } = await import('../../services/api')
    const mockChannel = { id: 'ch1', server_id: 's1', name: 'dev', type: 'text', position: 1, created_at: '' }
    vi.mocked(channels.create).mockResolvedValue(mockChannel as any)

    useServerStore.setState({ activeServerId: 's1' })

    await useServerStore.getState().createChannel('dev', 'text')

    expect(channels.create).toHaveBeenCalledWith('s1', { name: 'dev', type: 'text' })
    expect(useServerStore.getState().channels).toHaveLength(1)
  })

  it('should createChannel without activeServerId', async () => {
    const { channels } = await import('../../services/api')

    await useServerStore.getState().createChannel('dev', 'text')

    expect(channels.create).not.toHaveBeenCalled()
  })

  it('should addChannel', () => {
    const channel = { id: 'ch1', server_id: 's1', name: 'new', type: 'text' as const, position: 0, created_at: '' }
    useServerStore.getState().addChannel(channel)
    expect(useServerStore.getState().channels).toHaveLength(1)
  })

  it('should removeChannel clears active if removed', () => {
    useServerStore.setState({
      channels: [{ id: 'ch1', server_id: 's1', name: 'general', type: 'text', position: 0, created_at: '' } as any],
      activeChannelId: 'ch1'
    })

    useServerStore.getState().removeChannel('ch1')

    expect(useServerStore.getState().channels).toHaveLength(0)
    expect(useServerStore.getState().activeChannelId).toBeNull()
  })

  it('should addMember', () => {
    const member = { id: 'u1', username: 'user1', display_name: null, avatar_url: null, status: 'online', role: 'member' as const, nickname: null }
    useServerStore.getState().addMember(member)
    expect(useServerStore.getState().members).toHaveLength(1)
  })

  it('should removeMember', () => {
    useServerStore.setState({
      members: [{ id: 'u1', username: 'user1', display_name: null, avatar_url: null, status: 'online', role: 'member', nickname: null } as any]
    })

    useServerStore.getState().removeMember('u1')

    expect(useServerStore.getState().members).toHaveLength(0)
  })

  it('should clearError', () => {
    useServerStore.setState({ error: 'some error' })
    useServerStore.getState().clearError()
    expect(useServerStore.getState().error).toBeNull()
  })
})
