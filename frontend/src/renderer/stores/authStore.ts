import { create } from 'zustand'
import type { User } from '../types/models'
import { profile as profileApi, setTokens, clearTokens, setOAuthRefreshHandler, setAuthFailureHandler, tokenManager } from '../services/api'
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
  updateProfile: (data: { display_name?: string; bio?: string; pronouns?: string }) => Promise<void>
  updateStatus: (status: string) => Promise<void>
  updateCustomStatus: (data: { text: string; emoji: string; expires_in?: string }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  deleteAvatar: () => Promise<void>
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
    setOAuthRefreshHandler(() => get().refreshAccessToken())
    setAuthFailureHandler(() => get().logout())
    try {
      const tokens = await window.api.auth.getTokens()
      if (tokens.access_token) {
        setTokens(tokens.access_token, tokens.refresh_token ?? '', tokens.expires_at)
        tokenManager.suppressAuthFailure()
        try {
          wsService.connect(tokens.access_token)
          const user = await profileApi.get()
          set({
            user,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            isAuthenticated: true,
            isLoading: false
          })
          return
        } catch {
          // Access token expired or invalid — try refreshing before giving up
          if (tokens.refresh_token) {
            try {
              const refreshed = await oauthService.refreshToken(tokens.refresh_token)
              await storeTokensSecurely(refreshed)
              setTokens(refreshed.access_token, refreshed.refresh_token ?? '', refreshed.expires_at)
              wsService.disconnect()
              wsService.connect(refreshed.access_token)
              const user = await profileApi.get()
              set({
                user,
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
          set({ isLoading: false, isAuthenticated: false, user: null, accessToken: null, refreshToken: null })
        } finally {
          tokenManager.restoreAuthFailure()
        }
        return
      }

      set({ isLoading: false })
    } catch {
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

  refreshAccessToken: async () => {
    const { refreshToken } = get()
    if (!refreshToken) return false

    try {
      const tokens = await oauthService.refreshToken(refreshToken)
      await storeTokensSecurely(tokens)

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
  },

  logout: async () => {
    // Grab the id_token before clearing so Hydra knows which session to end
    let idToken: string | undefined
    try {
      const tokens = await window.api.auth.getTokens()
      idToken = tokens.id_token ?? undefined
    } catch { /* ignore */ }

    // Clear all local state first
    wsService.disconnect()
    clearTokens()
    try {
      await window.api.auth.clearTokens()
    } catch { /* ignore */ }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null
    })

    // Then trigger Hydra logout in system browser
    try {
      await oauthService.logout(idToken)
    } catch { /* ignore */ }
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
