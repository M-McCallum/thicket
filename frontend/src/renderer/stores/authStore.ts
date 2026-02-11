import { create } from 'zustand'
import type { User } from '../types/models'
import { auth as authApi, setTokens, clearTokens, setOnTokenRefresh } from '../services/api'
import { wsService } from '../services/ws'
import { oauthService } from '../services/oauth'
import type { OAuthTokens } from '../types/api'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  initAuth: () => Promise<void>
  startLogin: () => Promise<void>
  handleCallback: (url: string) => Promise<void>
  refreshAccessToken: () => Promise<boolean>
  login: (email: string, password: string) => Promise<void>
  signup: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setTokensFromStorage: (accessToken: string, refreshToken: string, user: User) => void
  clearError: () => void
}

async function storeTokensSecurely(tokens: OAuthTokens): Promise<void> {
  const toStore: Record<string, string> = {
    access_token: tokens.access_token
  }
  if (tokens.refresh_token) toStore.refresh_token = tokens.refresh_token
  if (tokens.id_token) toStore.id_token = tokens.id_token
  await window.api.auth.storeTokens(toStore)
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Set up token refresh callback for legacy auth
  setOnTokenRefresh(({ accessToken, refreshToken }) => {
    set({ accessToken, refreshToken })
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
  })

  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,

    initAuth: async () => {
      set({ isLoading: true })
      try {
        // Try safeStorage first (OAuth tokens)
        const tokens = await window.api.auth.getTokens()
        if (tokens.access_token) {
          setTokens(tokens.access_token, tokens.refresh_token ?? '')
          wsService.connect(tokens.access_token)

          // Fetch user profile from backend
          const profile = await authApi.me()
          set({
            user: {
              id: profile.user_id,
              username: profile.username,
              email: '',
              avatar_url: null,
              display_name: profile.username,
              status: 'online',
              created_at: ''
            },
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            isAuthenticated: true,
            isLoading: false
          })
          return
        }

        // Fall back to localStorage (legacy tokens)
        const accessToken = localStorage.getItem('accessToken')
        const refreshToken = localStorage.getItem('refreshToken')
        const userJson = localStorage.getItem('user')

        if (accessToken && refreshToken && userJson) {
          const user = JSON.parse(userJson)
          setTokens(accessToken, refreshToken)
          wsService.connect(accessToken)
          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false
          })
          return
        }

        set({ isLoading: false })
      } catch {
        // Failed to restore session, start fresh
        set({ isLoading: false })
      }
    },

    startLogin: async () => {
      set({ isLoading: true, error: null })
      try {
        await oauthService.startLogin()
        // Browser will redirect — loading stays true until callback
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to start OAuth login'
        })
      }
    },

    handleCallback: async (url: string) => {
      set({ isLoading: true, error: null })
      try {
        const tokens = await oauthService.handleCallback(url)
        await storeTokensSecurely(tokens)

        setTokens(tokens.access_token, tokens.refresh_token ?? '')
        wsService.connect(tokens.access_token)

        // Fetch user profile
        const profile = await authApi.me()
        set({
          user: {
            id: profile.user_id,
            username: profile.username,
            email: '',
            avatar_url: null,
            display_name: profile.username,
            status: 'online',
            created_at: ''
          },
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isAuthenticated: true,
          isLoading: false
        })
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'OAuth callback failed'
        })
      }
    },

    refreshAccessToken: async () => {
      const { refreshToken } = get()
      if (!refreshToken) return false

      try {
        const tokens = await oauthService.refreshToken(refreshToken)
        await storeTokensSecurely(tokens)

        setTokens(tokens.access_token, tokens.refresh_token ?? refreshToken)
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? refreshToken
        })
        return true
      } catch {
        return false
      }
    },

    // Legacy login — kept as secondary during dual-mode
    login: async (email, password) => {
      set({ isLoading: true, error: null })
      try {
        const response = await authApi.login({ email, password })
        const user = response.user as User
        setTokens(response.access_token, response.refresh_token)
        wsService.connect(response.access_token)

        localStorage.setItem('accessToken', response.access_token)
        localStorage.setItem('refreshToken', response.refresh_token)
        localStorage.setItem('user', JSON.stringify(user))

        set({
          user,
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
          isAuthenticated: true,
          isLoading: false
        })
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Login failed'
        })
      }
    },

    // Legacy signup — kept as secondary during dual-mode
    signup: async (username, email, password) => {
      set({ isLoading: true, error: null })
      try {
        const response = await authApi.signup({ username, email, password })
        const user = response.user as User
        setTokens(response.access_token, response.refresh_token)
        wsService.connect(response.access_token)

        localStorage.setItem('accessToken', response.access_token)
        localStorage.setItem('refreshToken', response.refresh_token)
        localStorage.setItem('user', JSON.stringify(user))

        set({
          user,
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
          isAuthenticated: true,
          isLoading: false
        })
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Signup failed'
        })
      }
    },

    logout: async () => {
      try {
        await authApi.logout()
      } catch {
        // Ignore errors on logout
      }
      try {
        await oauthService.logout()
      } catch {
        // Ignore OAuth logout errors
      }
      wsService.disconnect()
      clearTokens()
      // Clear both storage mechanisms
      try {
        await window.api.auth.clearTokens()
      } catch {
        // safeStorage may not be available in tests
      }
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        error: null
      })
    },

    setTokensFromStorage: (accessToken, refreshToken, user) => {
      setTokens(accessToken, refreshToken)
      wsService.connect(accessToken)
      set({ user, accessToken, refreshToken, isAuthenticated: true })
    },

    clearError: () => set({ error: null })
  }
})
