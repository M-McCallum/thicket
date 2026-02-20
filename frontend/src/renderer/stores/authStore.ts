import { create } from 'zustand'
import type { User } from '../types/models'
import { auth as authApi, setTokens, clearTokens } from '../services/api'
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
  logout: () => Promise<void>
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initAuth: async () => {
    set({ isLoading: true })
    try {
      const tokens = await window.api.auth.getTokens()
      if (tokens.access_token) {
        setTokens(tokens.access_token, tokens.refresh_token ?? '')
        wsService.connect(tokens.access_token)

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

      set({ isLoading: false })
    } catch {
      // Access token expired or invalid — try refreshing before giving up
      const tokens = await window.api.auth.getTokens()
      if (tokens.refresh_token) {
        try {
          const refreshed = await oauthService.refreshToken(tokens.refresh_token)
          await storeTokensSecurely(refreshed)
          setTokens(refreshed.access_token, refreshed.refresh_token ?? '')
          wsService.connect(refreshed.access_token)
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
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            isAuthenticated: true,
            isLoading: false
          })
          return
        } catch {
          // Refresh also failed — give up
        }
      }
      set({ isLoading: false })
    }
  },

  startLogin: async () => {
    set({ isLoading: true, error: null })
    try {
      await oauthService.startLogin()
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
    try {
      await window.api.auth.clearTokens()
    } catch {
      // safeStorage may not be available in tests
    }

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null
    })
  },

  clearError: () => set({ error: null })
}))
