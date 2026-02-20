import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../authStore'

// Mock the API module
vi.mock('../../services/api', () => ({
  auth: {
    logout: vi.fn(),
    me: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOAuthRefreshHandler: vi.fn()
}))

// Mock the WebSocket service
vi.mock('../../services/ws', () => ({
  wsService: {
    connect: vi.fn(),
    disconnect: vi.fn()
  }
}))

// Mock the OAuth service
vi.mock('../../services/oauth', () => ({
  oauthService: {
    startLogin: vi.fn(),
    handleCallback: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn()
  }
}))

// Mock window.api.auth
const authApiMock = {
  canEncrypt: vi.fn().mockResolvedValue(true),
  getStorageBackend: vi.fn().mockResolvedValue('keychain'),
  storeTokens: vi.fn().mockResolvedValue(undefined),
  getTokens: vi.fn().mockResolvedValue({ access_token: null, refresh_token: null, id_token: null }),
  clearTokens: vi.fn().mockResolvedValue(undefined),
  onCallback: vi.fn().mockReturnValue(() => {})
}
Object.defineProperty(window, 'api', {
  value: {
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    auth: authApiMock
  },
  writable: true
})

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    })
    authApiMock.getTokens.mockResolvedValue({ access_token: null, refresh_token: null, id_token: null })
    vi.clearAllMocks()
  })

  it('should have correct initial state', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should logout and clear state', async () => {
    const { auth } = await import('../../services/api')
    vi.mocked(auth.logout).mockResolvedValue({ message: 'logged out' })

    // Set authenticated state first
    useAuthStore.setState({
      user: { id: '123', username: 'test' } as any,
      accessToken: 'token',
      refreshToken: 'refresh',
      isAuthenticated: true
    })

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.accessToken).toBeNull()
  })

  it('should clear error', () => {
    useAuthStore.setState({ error: 'some error' })
    useAuthStore.getState().clearError()
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('should initAuth from safeStorage', async () => {
    const { auth } = await import('../../services/api')
    authApiMock.getTokens.mockResolvedValue({
      access_token: 'oauth-access',
      refresh_token: 'oauth-refresh',
      id_token: 'oauth-id'
    })
    vi.mocked(auth.me).mockResolvedValue({ user_id: 'u1', username: 'oauthuser' })

    await useAuthStore.getState().initAuth()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.username).toBe('oauthuser')
    expect(state.accessToken).toBe('oauth-access')
    expect(state.isLoading).toBe(false)
  })

  it('should handle OAuth callback', async () => {
    const { oauthService } = await import('../../services/oauth')
    const { auth } = await import('../../services/api')

    vi.mocked(oauthService.handleCallback).mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      id_token: 'new-id',
      expires_at: 9999999999
    })
    vi.mocked(auth.me).mockResolvedValue({ user_id: 'u3', username: 'callbackuser' })

    await useAuthStore.getState().handleCallback('thicket://auth/callback?code=abc')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.username).toBe('callbackuser')
    expect(authApiMock.storeTokens).toHaveBeenCalled()
  })

  it('should startLogin via OAuth', async () => {
    const { oauthService } = await import('../../services/oauth')
    vi.mocked(oauthService.startLogin).mockResolvedValue(undefined)

    await useAuthStore.getState().startLogin()

    expect(oauthService.startLogin).toHaveBeenCalled()
  })
})
