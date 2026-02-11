import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../authStore'

// Mock the API module
vi.mock('../../services/api', () => ({
  auth: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  setOnTokenRefresh: vi.fn()
}))

// Mock the WebSocket service
vi.mock('../../services/ws', () => ({
  wsService: {
    connect: vi.fn(),
    disconnect: vi.fn()
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
})
