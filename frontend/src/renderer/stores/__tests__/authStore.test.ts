import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../authStore'

const { tokenManagerMock } = vi.hoisted(() => ({
  tokenManagerMock: {
    suppressAuthFailure: vi.fn(),
    restoreAuthFailure: vi.fn()
  }
}))

// Mock the API module
vi.mock('../../services/api', () => ({
  profile: {
    get: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    updateCustomStatus: vi.fn(),
    uploadAvatar: vi.fn(),
    deleteAvatar: vi.fn()
  },
  auth: {
    logout: vi.fn(),
    me: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOAuthRefreshHandler: vi.fn(),
  setAuthFailureHandler: vi.fn(),
  tokenManager: tokenManagerMock
}))

// Mock the WebSocket service
vi.mock('../../services/ws', () => ({
  wsService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendTokenRefresh: vi.fn(),
    setOnSessionExpired: vi.fn()
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
  getTokens: vi.fn().mockResolvedValue({ access_token: null, refresh_token: null, id_token: null, expires_at: null }),
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
    authApiMock.getTokens.mockResolvedValue({ access_token: null, refresh_token: null, id_token: null, expires_at: null })
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
    const { profile } = await import('../../services/api')
    authApiMock.getTokens.mockResolvedValue({
      access_token: 'oauth-access',
      refresh_token: 'oauth-refresh',
      id_token: 'oauth-id',
      expires_at: 9999999999
    })
    vi.mocked(profile.get).mockResolvedValue({ id: 'u1', username: 'oauthuser' } as any)

    await useAuthStore.getState().initAuth()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.username).toBe('oauthuser')
    expect(state.accessToken).toBe('oauth-access')
    expect(state.isLoading).toBe(false)
  })

  it('should handle OAuth callback', async () => {
    const { oauthService } = await import('../../services/oauth')
    const { profile } = await import('../../services/api')

    vi.mocked(oauthService.handleCallback).mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      id_token: 'new-id',
      expires_at: 9999999999
    })
    vi.mocked(profile.get).mockResolvedValue({ id: 'u3', username: 'callbackuser' } as any)

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

  it('should initAuth with expired token → refresh succeeds', async () => {
    const { profile } = await import('../../services/api')
    const { oauthService } = await import('../../services/oauth')

    authApiMock.getTokens.mockResolvedValue({
      access_token: 'expired-access',
      refresh_token: 'valid-refresh',
      id_token: 'id',
      expires_at: 1000
    })

    vi.mocked(profile.get)
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockResolvedValueOnce({ id: 'u1', username: 'refreshed-user' } as any)

    vi.mocked(oauthService.refreshToken).mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      id_token: 'new-id',
      expires_at: 9999999999
    })

    await useAuthStore.getState().initAuth()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.username).toBe('refreshed-user')
    expect(state.isLoading).toBe(false)
  })

  it('should initAuth with expired token → refresh fails → not authenticated', async () => {
    const { profile } = await import('../../services/api')
    const { oauthService } = await import('../../services/oauth')

    authApiMock.getTokens.mockResolvedValue({
      access_token: 'expired-access',
      refresh_token: 'valid-refresh',
      id_token: 'id',
      expires_at: 1000
    })

    vi.mocked(profile.get).mockRejectedValue(new Error('Unauthorized'))
    vi.mocked(oauthService.refreshToken).mockRejectedValue(new Error('Refresh failed'))

    await useAuthStore.getState().initAuth()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.user).toBeNull()
  })

  it('should NOT trigger logout during initAuth even with expired token', async () => {
    const { profile } = await import('../../services/api')
    const { oauthService } = await import('../../services/oauth')

    authApiMock.getTokens.mockResolvedValue({
      access_token: 'expired-access',
      refresh_token: 'valid-refresh',
      id_token: 'id',
      expires_at: 1000
    })

    vi.mocked(profile.get).mockRejectedValue(new Error('Unauthorized'))
    vi.mocked(oauthService.refreshToken).mockRejectedValue(new Error('Refresh failed'))

    await useAuthStore.getState().initAuth()

    expect(tokenManagerMock.suppressAuthFailure).toHaveBeenCalled()
    expect(tokenManagerMock.restoreAuthFailure).toHaveBeenCalled()
  })
})
