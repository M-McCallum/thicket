import { create } from 'zustand'
import type { User } from '../types/models'
import { auth as authApi, setTokens, clearTokens, setOnTokenRefresh } from '../services/api'
import { wsService } from '../services/ws'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  signup: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setTokensFromStorage: (accessToken: string, refreshToken: string, user: User) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Set up token refresh callback
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
      wsService.disconnect()
      clearTokens()
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
