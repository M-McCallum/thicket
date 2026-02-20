package ory

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const defaultTimeout = 10 * time.Second

// KratosClient is an HTTP client for the Kratos Admin and Public APIs.
type KratosClient struct {
	adminURL  string
	publicURL string
	http      *http.Client
}

// NewKratosClient creates a KratosClient pointing at the given Kratos Admin and Public URLs.
func NewKratosClient(adminURL, publicURL string) *KratosClient {
	return &KratosClient{
		adminURL:  adminURL,
		publicURL: publicURL,
		http:      &http.Client{Timeout: defaultTimeout},
	}
}

// GetIdentity fetches a Kratos identity by ID.
func (c *KratosClient) GetIdentity(ctx context.Context, id string) (*Identity, error) {
	url := fmt.Sprintf("%s/admin/identities/%s", c.adminURL, id)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	var identity Identity
	if err := c.doJSON(req, &identity); err != nil {
		return nil, fmt.Errorf("get identity %s: %w", id, err)
	}
	return &identity, nil
}

// WhoAmI checks for an active Kratos session using the browser's cookies.
// Returns the session if active, or an error if no session exists.
func (c *KratosClient) WhoAmI(ctx context.Context, cookie string) (*KratosSession, error) {
	url := fmt.Sprintf("%s/sessions/whoami", c.publicURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	var session KratosSession
	if err := c.doJSON(req, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

// GetLoginFlow fetches a login flow from the Kratos public API.
// The cookie header is forwarded so Kratos can validate the CSRF token.
func (c *KratosClient) GetLoginFlow(ctx context.Context, flowID, cookie string) (*SelfServiceFlow, error) {
	url := fmt.Sprintf("%s/self-service/login/flows?id=%s", c.publicURL, flowID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	var flow SelfServiceFlow
	if err := c.doJSON(req, &flow); err != nil {
		return nil, fmt.Errorf("get login flow %s: %w", flowID, err)
	}
	return &flow, nil
}

// GetRegistrationFlow fetches a registration flow from the Kratos public API.
func (c *KratosClient) GetRegistrationFlow(ctx context.Context, flowID, cookie string) (*SelfServiceFlow, error) {
	url := fmt.Sprintf("%s/self-service/registration/flows?id=%s", c.publicURL, flowID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	var flow SelfServiceFlow
	if err := c.doJSON(req, &flow); err != nil {
		return nil, fmt.Errorf("get registration flow %s: %w", flowID, err)
	}
	return &flow, nil
}

// GetSelfServiceError fetches a self-service error container by its ID.
func (c *KratosClient) GetSelfServiceError(ctx context.Context, errorID string) (*SelfServiceError, error) {
	url := fmt.Sprintf("%s/self-service/errors?id=%s", c.publicURL, errorID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	var sseErr SelfServiceError
	if err := c.doJSON(req, &sseErr); err != nil {
		return nil, fmt.Errorf("get self-service error %s: %w", errorID, err)
	}
	return &sseErr, nil
}

func (c *KratosClient) doJSON(req *http.Request, out interface{}) error {
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

// HydraClient is an HTTP client for the Hydra Admin API.
type HydraClient struct {
	adminURL string
	http     *http.Client
}

// NewHydraClient creates a HydraClient pointing at the given Hydra Admin URL.
func NewHydraClient(adminURL string) *HydraClient {
	return &HydraClient{
		adminURL: adminURL,
		http:     &http.Client{Timeout: defaultTimeout},
	}
}

// GetLoginRequest fetches the login request for the given challenge.
func (c *HydraClient) GetLoginRequest(ctx context.Context, challenge string) (*LoginRequest, error) {
	url := fmt.Sprintf("%s/admin/oauth2/auth/requests/login?login_challenge=%s", c.adminURL, challenge)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	var lr LoginRequest
	if err := c.doJSON(req, http.StatusOK, &lr); err != nil {
		return nil, fmt.Errorf("get login request: %w", err)
	}
	return &lr, nil
}

// AcceptLogin accepts a login request and returns the redirect URL.
func (c *HydraClient) AcceptLogin(ctx context.Context, challenge string, body AcceptLoginRequest) (*CompletedRequest, error) {
	url := fmt.Sprintf("%s/admin/oauth2/auth/requests/login/accept?login_challenge=%s", c.adminURL, challenge)
	return c.putJSON(ctx, url, body)
}

// GetConsentRequest fetches the consent request for the given challenge.
func (c *HydraClient) GetConsentRequest(ctx context.Context, challenge string) (*ConsentRequest, error) {
	url := fmt.Sprintf("%s/admin/oauth2/auth/requests/consent?consent_challenge=%s", c.adminURL, challenge)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	var cr ConsentRequest
	if err := c.doJSON(req, http.StatusOK, &cr); err != nil {
		return nil, fmt.Errorf("get consent request: %w", err)
	}
	return &cr, nil
}

// AcceptConsent accepts a consent request and returns the redirect URL.
func (c *HydraClient) AcceptConsent(ctx context.Context, challenge string, body AcceptConsentRequest) (*CompletedRequest, error) {
	url := fmt.Sprintf("%s/admin/oauth2/auth/requests/consent/accept?consent_challenge=%s", c.adminURL, challenge)
	return c.putJSON(ctx, url, body)
}

// GetLogoutRequest fetches the logout request for the given challenge.
func (c *HydraClient) GetLogoutRequest(ctx context.Context, challenge string) (*LogoutRequest, error) {
	url := fmt.Sprintf("%s/admin/oauth2/auth/requests/logout?logout_challenge=%s", c.adminURL, challenge)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	var lr LogoutRequest
	if err := c.doJSON(req, http.StatusOK, &lr); err != nil {
		return nil, fmt.Errorf("get logout request: %w", err)
	}
	return &lr, nil
}

// AcceptLogout accepts a logout request and returns the redirect URL.
func (c *HydraClient) AcceptLogout(ctx context.Context, challenge string) (*CompletedRequest, error) {
	url := fmt.Sprintf("%s/admin/oauth2/auth/requests/logout/accept?logout_challenge=%s", c.adminURL, challenge)
	return c.putJSON(ctx, url, nil)
}

// RevokeConsentSessions revokes all consent sessions for a subject.
func (c *HydraClient) RevokeConsentSessions(ctx context.Context, subject string) error {
	url := fmt.Sprintf("%s/admin/oauth2/auth/sessions/consent?subject=%s", c.adminURL, subject)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	return c.doNoContent(req)
}

// RevokeRefreshTokens revokes all refresh tokens for a client.
func (c *HydraClient) RevokeRefreshTokens(ctx context.Context, clientID string) error {
	url := fmt.Sprintf("%s/admin/oauth2/tokens?client_id=%s", c.adminURL, clientID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	return c.doNoContent(req)
}

func (c *HydraClient) putJSON(ctx context.Context, url string, body interface{}) (*CompletedRequest, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(jsonBytes)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	var cr CompletedRequest
	if err := c.doJSON(req, http.StatusOK, &cr); err != nil {
		return nil, err
	}
	return &cr, nil
}

func (c *HydraClient) doJSON(req *http.Request, expectedStatus int, out interface{}) error {
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != expectedStatus {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *HydraClient) doNoContent(req *http.Request) error {
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}
