import type { OAuthTokens } from '@renderer/types/api'

const TOKEN_KEYS = {
  access_token: 'thicket_access_token',
  refresh_token: 'thicket_refresh_token',
  id_token: 'thicket_id_token'
} as const

export function storeTokens(tokens: OAuthTokens): void {
  localStorage.setItem(TOKEN_KEYS.access_token, tokens.access_token)
  if (tokens.refresh_token) {
    localStorage.setItem(TOKEN_KEYS.refresh_token, tokens.refresh_token)
  }
  if (tokens.id_token) {
    localStorage.setItem(TOKEN_KEYS.id_token, tokens.id_token)
  }
}

export function getTokens(): Record<string, string | null> {
  return {
    access_token: localStorage.getItem(TOKEN_KEYS.access_token),
    refresh_token: localStorage.getItem(TOKEN_KEYS.refresh_token),
    id_token: localStorage.getItem(TOKEN_KEYS.id_token)
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEYS.access_token)
  localStorage.removeItem(TOKEN_KEYS.refresh_token)
  localStorage.removeItem(TOKEN_KEYS.id_token)
}
