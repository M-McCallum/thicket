import { UserManager, WebStorageStateStore, User } from 'oidc-client-ts'
import type { OAuthTokens } from '../types/api'

const AUTHORITY = 'http://localhost:4444'
const CLIENT_ID = 'thicket-desktop'
const REDIRECT_URI = 'thicket://auth/callback'
const SCOPES = 'openid offline_access profile'

export class OAuthService {
  private userManager: UserManager

  constructor() {
    this.userManager = new UserManager({
      authority: AUTHORITY,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      response_type: 'code',
      // PKCE S256 is enabled by default in oidc-client-ts
      // Use in-memory storage only (tokens go to safeStorage via IPC)
      userStore: new WebStorageStateStore({ store: sessionStorage }),
      automaticSilentRenew: false
    })
  }

  async startLogin(): Promise<void> {
    await this.userManager.signinRedirect()
  }

  async handleCallback(url: string): Promise<OAuthTokens> {
    // oidc-client-ts expects the full callback URL to complete the PKCE exchange
    const user: User = await this.userManager.signinRedirectCallback(url)

    return {
      access_token: user.access_token,
      refresh_token: user.refresh_token ?? null,
      id_token: user.id_token ?? null,
      expires_at: user.expires_at ?? null
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    // Use the token endpoint directly for refresh
    const metadata = await this.userManager.metadataService.getMetadata()
    const tokenEndpoint = metadata.token_endpoint
    if (!tokenEndpoint) {
      throw new Error('Token endpoint not found in OIDC metadata')
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`)
    }

    const data = await response.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      id_token: data.id_token ?? null,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : null
    }
  }

  async logout(): Promise<void> {
    try {
      await this.userManager.signoutRedirect()
    } catch {
      // If signout redirect fails, just clear local state
      await this.userManager.removeUser()
    }
  }
}

export const oauthService = new OAuthService()
