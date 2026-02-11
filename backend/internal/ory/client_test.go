package ory

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- KratosClient tests ---

func TestKratosClient_GetIdentity(t *testing.T) {
	identity := Identity{
		ID:       "test-identity-id",
		SchemaID: "default",
		Traits: IdentityTraits{
			Username:    "alice",
			Email:       "alice@example.com",
			DisplayName: "Alice",
		},
		State: "active",
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/admin/identities/test-identity-id", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(identity)
	}))
	defer srv.Close()

	client := NewKratosClient(srv.URL)
	result, err := client.GetIdentity(context.Background(), "test-identity-id")
	require.NoError(t, err)

	assert.Equal(t, identity.ID, result.ID)
	assert.Equal(t, identity.Traits.Username, result.Traits.Username)
	assert.Equal(t, identity.Traits.Email, result.Traits.Email)
	assert.Equal(t, identity.Traits.DisplayName, result.Traits.DisplayName)
}

func TestKratosClient_GetIdentity_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":"not found"}`))
	}))
	defer srv.Close()

	client := NewKratosClient(srv.URL)
	_, err := client.GetIdentity(context.Background(), "missing-id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "404")
}

// --- HydraClient tests ---

func TestHydraClient_GetLoginRequest(t *testing.T) {
	lr := LoginRequest{
		Challenge: "login-challenge-123",
		Subject:   "subject-uuid",
		Skip:      false,
		Client: OAuth2Client{
			ClientID:   "my-client",
			ClientName: "My App",
		},
		RequestedScope: []string{"openid", "offline_access"},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/admin/oauth2/auth/requests/login", r.URL.Path)
		assert.Equal(t, "login-challenge-123", r.URL.Query().Get("login_challenge"))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(lr)
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	result, err := client.GetLoginRequest(context.Background(), "login-challenge-123")
	require.NoError(t, err)

	assert.Equal(t, lr.Challenge, result.Challenge)
	assert.Equal(t, lr.Subject, result.Subject)
	assert.Equal(t, lr.Skip, result.Skip)
	assert.Equal(t, lr.Client.ClientID, result.Client.ClientID)
	assert.Equal(t, lr.RequestedScope, result.RequestedScope)
}

func TestHydraClient_AcceptLogin(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPut, r.Method)
		assert.Equal(t, "/admin/oauth2/auth/requests/login/accept", r.URL.Path)
		assert.Equal(t, "challenge-abc", r.URL.Query().Get("login_challenge"))

		var body AcceptLoginRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		assert.Equal(t, "subject-uuid", body.Subject)
		assert.True(t, body.Remember)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(CompletedRequest{
			RedirectTo: "https://hydra/callback",
		})
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	result, err := client.AcceptLogin(context.Background(), "challenge-abc", AcceptLoginRequest{
		Subject:  "subject-uuid",
		Remember: true,
	})
	require.NoError(t, err)
	assert.Equal(t, "https://hydra/callback", result.RedirectTo)
}

func TestHydraClient_GetConsentRequest(t *testing.T) {
	cr := ConsentRequest{
		Challenge:      "consent-challenge-456",
		Subject:        "subject-uuid",
		RequestedScope: []string{"openid", "offline_access"},
		Client: OAuth2Client{
			ClientID: "my-client",
			Metadata: map[string]interface{}{"is_first_party": true},
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/admin/oauth2/auth/requests/consent", r.URL.Path)
		assert.Equal(t, "consent-challenge-456", r.URL.Query().Get("consent_challenge"))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cr)
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	result, err := client.GetConsentRequest(context.Background(), "consent-challenge-456")
	require.NoError(t, err)

	assert.Equal(t, cr.Challenge, result.Challenge)
	assert.Equal(t, cr.Subject, result.Subject)
	assert.Equal(t, cr.RequestedScope, result.RequestedScope)
	assert.Equal(t, true, result.Client.Metadata["is_first_party"])
}

func TestHydraClient_AcceptConsent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPut, r.Method)
		assert.Equal(t, "/admin/oauth2/auth/requests/consent/accept", r.URL.Path)
		assert.Equal(t, "consent-xyz", r.URL.Query().Get("consent_challenge"))

		var body AcceptConsentRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		assert.Equal(t, []string{"openid", "offline_access"}, body.GrantScope)
		assert.True(t, body.Remember)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(CompletedRequest{
			RedirectTo: "https://hydra/consent-callback",
		})
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	result, err := client.AcceptConsent(context.Background(), "consent-xyz", AcceptConsentRequest{
		GrantScope: []string{"openid", "offline_access"},
		Remember:   true,
	})
	require.NoError(t, err)
	assert.Equal(t, "https://hydra/consent-callback", result.RedirectTo)
}

func TestHydraClient_GetLogoutRequest(t *testing.T) {
	lr := LogoutRequest{
		Challenge:   "logout-challenge-789",
		Subject:     "subject-uuid",
		SessionID:   "session-123",
		RPInitiated: true,
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/admin/oauth2/auth/requests/logout", r.URL.Path)
		assert.Equal(t, "logout-challenge-789", r.URL.Query().Get("logout_challenge"))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(lr)
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	result, err := client.GetLogoutRequest(context.Background(), "logout-challenge-789")
	require.NoError(t, err)

	assert.Equal(t, lr.Challenge, result.Challenge)
	assert.Equal(t, lr.Subject, result.Subject)
	assert.True(t, result.RPInitiated)
}

func TestHydraClient_AcceptLogout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPut, r.Method)
		assert.Equal(t, "/admin/oauth2/auth/requests/logout/accept", r.URL.Path)
		assert.Equal(t, "logout-abc", r.URL.Query().Get("logout_challenge"))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(CompletedRequest{
			RedirectTo: "https://app/logged-out",
		})
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	result, err := client.AcceptLogout(context.Background(), "logout-abc")
	require.NoError(t, err)
	assert.Equal(t, "https://app/logged-out", result.RedirectTo)
}

func TestHydraClient_RevokeConsentSessions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, "/admin/oauth2/auth/sessions/consent", r.URL.Path)
		assert.Equal(t, "subject-uuid", r.URL.Query().Get("subject"))

		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	err := client.RevokeConsentSessions(context.Background(), "subject-uuid")
	require.NoError(t, err)
}

func TestHydraClient_RevokeRefreshTokens(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, "/admin/oauth2/tokens", r.URL.Path)
		assert.Equal(t, "my-client-id", r.URL.Query().Get("client_id"))

		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	err := client.RevokeRefreshTokens(context.Background(), "my-client-id")
	require.NoError(t, err)
}

func TestHydraClient_ErrorResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"internal error"}`))
	}))
	defer srv.Close()

	client := NewHydraClient(srv.URL)
	_, err := client.GetLoginRequest(context.Background(), "bad-challenge")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}
