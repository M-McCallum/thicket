import { OidcClient, WebStorageStateStore } from 'oidc-client-ts'
import type { OAuthTokens } from '../types/api'

const AUTHORITY = import.meta.env.VITE_OIDC_AUTHORITY || 'http://localhost:4444'
const CLIENT_ID = 'thicket-desktop'
const REDIRECT_URI = 'thicket://auth/callback'
const SCOPES = 'openid offline_access profile'

export class OAuthService {
  private client: OidcClient

  constructor() {
    // OidcClient is the right abstraction for Electron desktop apps:
    // we control navigation ourselves (open system browser, handle custom protocol callback).
    // UserManager is designed for browser-based redirects and doesn't expose createSigninRequest.
    this.client = new OidcClient({
      authority: AUTHORITY,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      response_type: 'code',
      // PKCE S256 is enabled by default in oidc-client-ts
      stateStore: new WebStorageStateStore({ store: sessionStorage })
    })
  }

  async startLogin(): Promise<void> {
    // Build the authorization URL and open it in the system browser
    const request = await this.client.createSigninRequest({})
    await window.api.openExternal(request.url)
  }

  async handleCallback(url: string): Promise<OAuthTokens> {
    // oidc-client-ts reads the stored PKCE state and exchanges the code for tokens
    const response = await this.client.processSigninResponse(url)

    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token ?? null,
      id_token: response.id_token ?? null,
      expires_at: response.expires_in
        ? Math.floor(Date.now() / 1000) + response.expires_in
        : null
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    // Use the token endpoint directly for refresh
    const metadata = await this.client.metadataService.getMetadata()
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
      const request = await this.client.createSignoutRequest()
      await window.api.openExternal(request.url)
    } catch {
      // If signout request fails, just clear stale state
      await this.client.clearStaleState()
    }
  }
}

export const oauthService = new OAuthService()
