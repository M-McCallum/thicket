import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../authStore'

// Mock the API module
vi.mock('../../services/api', () => ({
  auth: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    me: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOnTokenRefresh: vi.fn(),
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

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

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
    localStorageMock.clear()
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

  it('should login successfully', async () => {
    const { auth } = await import('../../services/api')
    const mockResponse = {
      user: {
        id: '123',
        username: 'testuser',
        email: 'test@test.com',
        display_name: 'Test User',
        avatar_url: null,
        status: 'online'
      },
      access_token: 'access-123',
      refresh_token: 'refresh-123'
    }
    vi.mocked(auth.login).mockResolvedValue(mockResponse)

    await useAuthStore.getState().login('test@test.com', 'password123')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.username).toBe('testuser')
    expect(state.accessToken).toBe('access-123')
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should handle login error', async () => {
    const { auth } = await import('../../services/api')
    vi.mocked(auth.login).mockRejectedValue(new Error('invalid credentials'))

    await useAuthStore.getState().login('test@test.com', 'wrong')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.error).toBe('invalid credentials')
    expect(state.isLoading).toBe(false)
  })

  it('should signup successfully', async () => {
    const { auth } = await import('../../services/api')
    const mockResponse = {
      user: {
        id: '456',
        username: 'newuser',
        email: 'new@test.com',
        display_name: 'newuser',
        avatar_url: null,
        status: 'online'
      },
      access_token: 'access-456',
      refresh_token: 'refresh-456'
    }
    vi.mocked(auth.signup).mockResolvedValue(mockResponse)

    await useAuthStore.getState().signup('newuser', 'new@test.com', 'password123')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.username).toBe('newuser')
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

  it('should set tokens from storage', () => {
    const user = { id: '123', username: 'test' } as any
    useAuthStore.getState().setTokensFromStorage('access', 'refresh', user)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.id).toBe('123')
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

  it('should initAuth fallback to localStorage', async () => {
    localStorageMock.setItem('accessToken', 'legacy-access')
    localStorageMock.setItem('refreshToken', 'legacy-refresh')
    localStorageMock.setItem('user', JSON.stringify({ id: 'u2', username: 'legacyuser' }))

    await useAuthStore.getState().initAuth()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.username).toBe('legacyuser')
    expect(state.accessToken).toBe('legacy-access')
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
