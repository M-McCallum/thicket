package ory

import "time"

// Hydra Admin API types

// LoginRequest represents Hydra's GET /admin/oauth2/auth/requests/login response.
type LoginRequest struct {
	Challenge       string       `json:"challenge"`
	RequestedScope  []string     `json:"requested_scope"`
	RequestedAt     time.Time    `json:"requested_at,omitempty"`
	Subject         string       `json:"subject"`
	Skip            bool         `json:"skip"`
	Client          OAuth2Client `json:"client"`
	RequestURL      string       `json:"request_url"`
	SessionID       string       `json:"session_id,omitempty"`
	OIDCContext     *OIDCContext `json:"oidc_context,omitempty"`
}

// OAuth2Client represents a Hydra OAuth2 client.
type OAuth2Client struct {
	ClientID   string                 `json:"client_id"`
	ClientName string                 `json:"client_name,omitempty"`
	Scope      string                 `json:"scope,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// OIDCContext contains OpenID Connect context for the login/consent request.
type OIDCContext struct {
	ACRValues         []string `json:"acr_values,omitempty"`
	Display           string   `json:"display,omitempty"`
	IDTokenHintClaims map[string]interface{} `json:"id_token_hint_claims,omitempty"`
	LoginHint         string   `json:"login_hint,omitempty"`
	UILocales         []string `json:"ui_locales,omitempty"`
}

// AcceptLoginRequest is the body sent to PUT /admin/oauth2/auth/requests/login/accept.
type AcceptLoginRequest struct {
	Subject     string `json:"subject"`
	Remember    bool   `json:"remember,omitempty"`
	RememberFor int    `json:"remember_for,omitempty"`
	ACR         string `json:"acr,omitempty"`
}

// ConsentRequest represents Hydra's GET /admin/oauth2/auth/requests/consent response.
type ConsentRequest struct {
	Challenge               string       `json:"challenge"`
	RequestedScope          []string     `json:"requested_scope"`
	RequestedAccessTokenAudience []string `json:"requested_access_token_audience"`
	Subject                 string       `json:"subject"`
	Skip                    bool         `json:"skip"`
	Client                  OAuth2Client `json:"client"`
	RequestURL              string       `json:"request_url"`
	LoginChallenge          string       `json:"login_challenge,omitempty"`
	LoginSessionID          string       `json:"login_session_id,omitempty"`
}

// AcceptConsentRequest is the body sent to PUT /admin/oauth2/auth/requests/consent/accept.
type AcceptConsentRequest struct {
	GrantScope               []string     `json:"grant_scope"`
	GrantAccessTokenAudience []string     `json:"grant_access_token_audience,omitempty"`
	Remember                 bool         `json:"remember,omitempty"`
	RememberFor              int          `json:"remember_for,omitempty"`
	Session                  *ConsentSession `json:"session,omitempty"`
}

// ConsentSession contains session data to attach to the consent.
type ConsentSession struct {
	AccessToken map[string]interface{} `json:"access_token,omitempty"`
	IDToken     map[string]interface{} `json:"id_token,omitempty"`
}

// CompletedRequest is the response from Hydra when accepting/rejecting a login or consent.
type CompletedRequest struct {
	RedirectTo string `json:"redirect_to"`
}

// LogoutRequest represents Hydra's GET /admin/oauth2/auth/requests/logout response.
type LogoutRequest struct {
	Challenge   string `json:"challenge"`
	Subject     string `json:"subject"`
	SessionID   string `json:"sid,omitempty"`
	RequestURL  string `json:"request_url,omitempty"`
	RPInitiated bool   `json:"rp_initiated"`
}

// TokenIntrospection represents Hydra's POST /admin/oauth2/introspect response.
type TokenIntrospection struct {
	Active    bool     `json:"active"`
	Sub       string   `json:"sub,omitempty"`
	ClientID  string   `json:"client_id,omitempty"`
	Scope     string   `json:"scope,omitempty"`
	Exp       int64    `json:"exp,omitempty"`
	Iat       int64    `json:"iat,omitempty"`
	Aud       []string `json:"aud,omitempty"`
	Iss       string   `json:"iss,omitempty"`
	TokenType string   `json:"token_type,omitempty"`
	TokenUse  string   `json:"token_use,omitempty"`
}

// Kratos Admin API types

// Identity represents a Kratos identity from GET /admin/identities/{id}.
type Identity struct {
	ID       string         `json:"id"`
	SchemaID string         `json:"schema_id,omitempty"`
	Traits   IdentityTraits `json:"traits"`
	State    string         `json:"state,omitempty"`
}

// IdentityTraits contains the user profile data stored in Kratos.
type IdentityTraits struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name,omitempty"`
}

// RejectRequest is the body sent when rejecting a login, consent, or logout request.
type RejectRequest struct {
	Error            string `json:"error,omitempty"`
	ErrorDescription string `json:"error_description,omitempty"`
	ErrorHint        string `json:"error_hint,omitempty"`
	StatusCode       int    `json:"status_code,omitempty"`
}
