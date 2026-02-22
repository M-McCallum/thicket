import { create } from 'zustand'
import type { User } from '@/types/models'
import { profile as profileApi, setTokens, clearTokens as clearApiTokens, setOAuthRefreshHandler, setAuthFailureHandler, tokenManager } from '@/services/api'
import { wsService } from '@/services/ws'
import { oauthService } from '@/services/oauth'
import { storeTokens, getTokens, clearTokens as clearStoredTokens } from '@/services/tokenStorage'
import type { OAuthTokens } from '@/types/api'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  initAuth: () => Promise<void>
  startLogin: () => Promise<void>
  handleCallback: () => Promise<void>
  refreshAccessToken: () => Promise<boolean>
  logout: () => Promise<void>
  updateProfile: (data: { display_name?: string; bio?: string; pronouns?: string }) => Promise<void>
  updateStatus: (status: string) => Promise<void>
  updateCustomStatus: (data: { text: string; emoji: string; expires_in?: string }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  deleteAvatar: () => Promise<void>
  clearError: () => void
}

function storeTokensLocally(tokens: OAuthTokens): void {
  storeTokens(tokens)
}

// Deduplication guard: concurrent callers share the same in-flight refresh promise.
// This prevents Hydra's refresh-token rotation from invalidating a token that a
// second caller is about to use.
let inflightRefresh: Promise<boolean> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initAuth: async () => {
    set({ isLoading: true })
    setOAuthRefreshHandler(() => get().refreshAccessToken())
    setAuthFailureHandler(() => get().logout())
    wsService.setOnSessionExpired(() => {
      get().refreshAccessToken().then(ok => { if (!ok) get().logout() })
    })
    try {
      const tokens = getTokens()
      if (tokens.access_token) {
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
        setTokens(tokens.access_token, tokens.refresh_token ?? '', tokens.expires_at)
        tokenManager.suppressAuthFailure()
        try {
          wsService.connect(tokens.access_token)
          const user = await profileApi.get()
          set({
            user,
            isAuthenticated: true,
            isLoading: false
          })
          return
        } catch {
          // Access token expired — try refreshing before giving up
          if (tokens.refresh_token) {
            try {
              const refreshed = await get().refreshAccessToken()
              if (refreshed) {
                const newTokens = getTokens()
                if (newTokens.access_token) {
                  wsService.disconnect()
                  wsService.connect(newTokens.access_token)
                }
                const user = await profileApi.get()
                set({
                  user,
                  isAuthenticated: true,
                  isLoading: false
                })
                return
              }
            } catch {
              // Refresh also failed
            }
          }
          wsService.disconnect()
          set({ isLoading: false, isAuthenticated: false, user: null, accessToken: null, refreshToken: null })
        } finally {
          tokenManager.restoreAuthFailure()
        }
        return
      }
      set({ isLoading: false })
    } catch {
      wsService.disconnect()
      set({ isLoading: false, isAuthenticated: false, user: null, accessToken: null, refreshToken: null })
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

  handleCallback: async () => {
    set({ isLoading: true, error: null })
    try {
      const tokens = await oauthService.handleCallback()
      storeTokensLocally(tokens)
      setTokens(tokens.access_token, tokens.refresh_token ?? '', tokens.expires_at)
      wsService.connect(tokens.access_token)
      const user = await profileApi.get()
      set({
        user,
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

  refreshAccessToken: () => {
    if (inflightRefresh) return inflightRefresh

    inflightRefresh = (async () => {
      const { refreshToken } = get()
      if (!refreshToken) return false
      try {
        const tokens = await oauthService.refreshToken(refreshToken)
        storeTokensLocally(tokens)
        setTokens(tokens.access_token, tokens.refresh_token ?? refreshToken, tokens.expires_at)
        wsService.sendTokenRefresh(tokens.access_token)
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? refreshToken
        })
        return true
      } catch {
        return false
      }
    })()

    inflightRefresh.finally(() => { inflightRefresh = null })
    return inflightRefresh
  },

  logout: async () => {
    const idToken = getTokens().id_token ?? undefined
    // Clear all local state BEFORE navigating to Hydra, because
    // signoutRedirect navigates the page away and code after it won't run.
    wsService.disconnect()
    clearApiTokens()
    clearStoredTokens()
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null
    })
    try { await oauthService.logout(idToken) } catch { /* Ignore */ }
  },

  updateProfile: async (data) => {
    const user = await profileApi.update(data)
    set({ user })
  },

  updateStatus: async (status) => {
    await profileApi.updateStatus(status)
    const { user } = get()
    if (user) {
      const dbStatus = status === 'invisible' ? 'offline' : status
      set({ user: { ...user, status: dbStatus as User['status'] } })
    }
  },

  updateCustomStatus: async (data) => {
    const user = await profileApi.updateCustomStatus(data)
    set({ user })
  },

  uploadAvatar: async (file) => {
    const user = await profileApi.uploadAvatar(file)
    set({ user })
  },

  deleteAvatar: async () => {
    const user = await profileApi.deleteAvatar()
    set({ user })
  },

  clearError: () => set({ error: null })
}))
