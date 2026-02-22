import type { OAuthTokens } from '@/types/api'

const TOKEN_KEYS = {
  access_token: 'thicket_access_token',
  refresh_token: 'thicket_refresh_token',
  id_token: 'thicket_id_token',
  expires_at: 'thicket_token_expires_at'
} as const

export function storeTokens(tokens: OAuthTokens): void {
  localStorage.setItem(TOKEN_KEYS.access_token, tokens.access_token)
  if (tokens.refresh_token) {
    localStorage.setItem(TOKEN_KEYS.refresh_token, tokens.refresh_token)
  }
  if (tokens.id_token) {
    localStorage.setItem(TOKEN_KEYS.id_token, tokens.id_token)
  }
  if (tokens.expires_at != null) {
    localStorage.setItem(TOKEN_KEYS.expires_at, String(tokens.expires_at))
  }
}

export function getTokens(): { access_token: string | null; refresh_token: string | null; id_token: string | null; expires_at: number | null } {
  const expiresRaw = localStorage.getItem(TOKEN_KEYS.expires_at)
  return {
    access_token: localStorage.getItem(TOKEN_KEYS.access_token),
    refresh_token: localStorage.getItem(TOKEN_KEYS.refresh_token),
    id_token: localStorage.getItem(TOKEN_KEYS.id_token),
    expires_at: expiresRaw ? Number(expiresRaw) : null
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEYS.access_token)
  localStorage.removeItem(TOKEN_KEYS.refresh_token)
  localStorage.removeItem(TOKEN_KEYS.id_token)
  localStorage.removeItem(TOKEN_KEYS.expires_at)
}
