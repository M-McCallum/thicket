package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/ory"
)

// mockHydra creates an httptest server that handles Hydra admin API endpoints.
// loginResp controls GET /admin/oauth2/auth/requests/login
// acceptResp controls PUT /admin/oauth2/auth/requests/login/accept
func mockHydra(t *testing.T, loginResp *ory.LoginRequest, acceptRedirect string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/admin/oauth2/auth/requests/login"):
			if loginResp == nil {
				http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(loginResp)

		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/admin/oauth2/auth/requests/login/accept"):
			json.NewEncoder(w).Encode(ory.CompletedRequest{RedirectTo: acceptRedirect})

		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	}))
}

// mockKratos creates an httptest server that handles Kratos public API endpoints.
// session controls GET /sessions/whoami (nil = 401)
// flow controls GET /self-service/login/flows (nil = 404)
func mockKratos(t *testing.T, session *ory.KratosSession, flow *ory.SelfServiceFlow) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.URL.Path == "/sessions/whoami":
			if session == nil {
				http.Error(w, `{"error":"no session"}`, http.StatusUnauthorized)
				return
			}
			json.NewEncoder(w).Encode(session)

		case strings.HasPrefix(r.URL.Path, "/self-service/login/flows"):
			if flow == nil {
				http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(flow)

		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	}))
}

func newOryApp(h *OryHandler) *fiber.App {
	app := fiber.New()
	app.Get("/auth/login", h.GetLogin)
	return app
}

// --- Case 1: login_challenge + Hydra says skip=true ---

func TestGetLogin_ChallengeSkip(t *testing.T) {
	hydra := mockHydra(t, &ory.LoginRequest{
		Challenge: "ch1",
		Skip:      true,
		Subject:   "user-abc",
	}, "https://hydra/callback?code=ok")
	defer hydra.Close()

	kratos := mockKratos(t, nil, nil)
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	req := httptest.NewRequest(http.MethodGet, "/auth/login?login_challenge=ch1", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusSeeOther {
		t.Fatalf("expected 303, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc != "https://hydra/callback?code=ok" {
		t.Fatalf("unexpected redirect: %s", loc)
	}
}

// --- Case 2: login_challenge + active Kratos session ---

func TestGetLogin_ChallengeWithSession(t *testing.T) {
	hydra := mockHydra(t, &ory.LoginRequest{
		Challenge: "ch2",
		Skip:      false,
	}, "https://hydra/callback?code=session")
	defer hydra.Close()

	kratos := mockKratos(t, &ory.KratosSession{
		ID:     "sess-1",
		Active: true,
		Identity: ory.Identity{
			ID: "identity-42",
		},
	}, nil)
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	req := httptest.NewRequest(http.MethodGet, "/auth/login?login_challenge=ch2", nil)
	req.Header.Set("Cookie", "ory_kratos_session=valid")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusSeeOther {
		t.Fatalf("expected 303, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc != "https://hydra/callback?code=session" {
		t.Fatalf("unexpected redirect: %s", loc)
	}
}

// --- Case 3: login_challenge + no session → redirect to Kratos with cookie ---

func TestGetLogin_ChallengeNoSession(t *testing.T) {
	hydra := mockHydra(t, &ory.LoginRequest{
		Challenge: "ch3",
		Skip:      false,
	}, "")
	defer hydra.Close()

	kratos := mockKratos(t, nil, nil)
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	req := httptest.NewRequest(http.MethodGet, "/auth/login?login_challenge=ch3", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusSeeOther {
		t.Fatalf("expected 303, got %d", resp.StatusCode)
	}

	// Verify the HMAC cookie was set
	var challengeCookie *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "hydra_login_challenge" {
			challengeCookie = c
			break
		}
	}
	if challengeCookie == nil {
		t.Fatal("expected hydra_login_challenge cookie to be set")
	}
	if !strings.Contains(challengeCookie.Value, "ch3.") {
		t.Fatalf("cookie should contain signed challenge, got: %s", challengeCookie.Value)
	}

	// Verify redirect URL contains both login_challenge and return_to
	loc, err := url.Parse(resp.Header.Get("Location"))
	if err != nil {
		t.Fatalf("parse location: %v", err)
	}
	if loc.Path != "/self-service/login/browser" {
		t.Fatalf("unexpected path: %s", loc.Path)
	}
	if loc.Query().Get("login_challenge") != "ch3" {
		t.Fatalf("missing login_challenge in redirect, got query: %s", loc.RawQuery)
	}
	returnTo := loc.Query().Get("return_to")
	if returnTo == "" {
		t.Fatal("missing return_to in redirect")
	}
	// return_to should point back to /auth/login?login_challenge=ch3
	parsed, err := url.Parse(returnTo)
	if err != nil {
		t.Fatalf("parse return_to: %v", err)
	}
	if parsed.Path != "/auth/login" {
		t.Fatalf("return_to path should be /auth/login, got: %s", parsed.Path)
	}
	if parsed.Query().Get("login_challenge") != "ch3" {
		t.Fatalf("return_to should include login_challenge=ch3, got: %s", parsed.RawQuery)
	}
}

// --- Case 4: flow param → render login form ---

func TestGetLogin_FlowParam(t *testing.T) {
	hydra := mockHydra(t, nil, "")
	defer hydra.Close()

	kratos := mockKratos(t, nil, &ory.SelfServiceFlow{
		ID:   "flow-1",
		Type: "browser",
		UI: ory.FlowUI{
			Action: "https://kratos/self-service/login?flow=flow-1",
			Method: "POST",
			Nodes: []ory.FlowNode{
				{
					Type:  "input",
					Group: "default",
					Attributes: ory.FlowAttributes{
						Name:     "csrf_token",
						Type:     "hidden",
						Value:    "token123",
						NodeType: "input",
					},
				},
			},
		},
	})
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	req := httptest.NewRequest(http.MethodGet, "/auth/login?flow=flow-1", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/html") {
		t.Fatalf("expected text/html content type, got: %s", ct)
	}

	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "Sign In") {
		t.Fatal("expected login form to contain 'Sign In'")
	}
	if !strings.Contains(string(body), "token123") {
		t.Fatal("expected login form to contain CSRF token")
	}
}

// --- Case 5: no params + valid HMAC cookie + active session → accept login ---

func TestGetLogin_OIDCRecovery(t *testing.T) {
	hydra := mockHydra(t, &ory.LoginRequest{
		Challenge: "ch5",
		Skip:      false,
	}, "https://hydra/callback?code=oidc-done")
	defer hydra.Close()

	kratos := mockKratos(t, &ory.KratosSession{
		ID:     "sess-5",
		Active: true,
		Identity: ory.Identity{
			ID: "identity-55",
		},
	}, nil)
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	// Sign the challenge using the handler's key
	signed := h.signChallenge("ch5")

	req := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
	req.Header.Set("Cookie", "hydra_login_challenge="+signed+"; ory_kratos_session=valid")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusSeeOther {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 303, got %d; body: %s", resp.StatusCode, string(body))
	}

	loc := resp.Header.Get("Location")
	if loc != "https://hydra/callback?code=oidc-done" {
		t.Fatalf("unexpected redirect: %s", loc)
	}

	// Verify the challenge cookie is cleared
	for _, c := range resp.Cookies() {
		if c.Name == "hydra_login_challenge" {
			if c.MaxAge != -1 {
				t.Fatalf("expected cookie MaxAge=-1 (cleared), got %d", c.MaxAge)
			}
			break
		}
	}
}

// --- Case 6: no params + tampered cookie + active session → error page ---

func TestGetLogin_TamperedCookie(t *testing.T) {
	hydra := mockHydra(t, nil, "")
	defer hydra.Close()

	kratos := mockKratos(t, &ory.KratosSession{
		ID:     "sess-6",
		Active: true,
		Identity: ory.Identity{
			ID: "identity-66",
		},
	}, nil)
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	req := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
	req.Header.Set("Cookie", "hydra_login_challenge=ch6.tampered_signature; ory_kratos_session=valid")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 (error page), got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "expired") {
		t.Fatalf("expected error page about expired session, got: %s", string(body))
	}
}

// --- Case 7: no params + no cookie + active session → error page (loop breaker) ---

func TestGetLogin_ActiveSessionNoCookie(t *testing.T) {
	hydra := mockHydra(t, nil, "")
	defer hydra.Close()

	kratos := mockKratos(t, &ory.KratosSession{
		ID:     "sess-7",
		Active: true,
		Identity: ory.Identity{
			ID: "identity-77",
		},
	}, nil)
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	req := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
	req.Header.Set("Cookie", "ory_kratos_session=valid")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 (error page), got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	if !strings.Contains(bodyStr, "expired") {
		t.Fatalf("expected error page about expired session, got: %s", bodyStr)
	}
	// Should NOT redirect (that would cause a loop)
	if resp.Header.Get("Location") != "" {
		t.Fatal("should not redirect when active session exists without challenge")
	}
}

// --- Case 8: no params + no session → redirect to Kratos login browser ---

func TestGetLogin_NoParamsNoSession(t *testing.T) {
	hydra := mockHydra(t, nil, "")
	defer hydra.Close()

	kratos := mockKratos(t, nil, nil)
	defer kratos.Close()

	h := NewOryHandler(ory.NewHydraClient(hydra.URL), ory.NewKratosClient(kratos.URL, kratos.URL), nil, kratos.URL)
	app := newOryApp(h)

	req := httptest.NewRequest(http.MethodGet, "/auth/login", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusSeeOther {
		t.Fatalf("expected 303, got %d", resp.StatusCode)
	}

	loc := resp.Header.Get("Location")
	expected := kratos.URL + "/self-service/login/browser"
	if loc != expected {
		t.Fatalf("expected redirect to %s, got %s", expected, loc)
	}
}

// --- HMAC helper tests ---

func TestSignVerifyChallenge_Roundtrip(t *testing.T) {
	h := NewOryHandler(ory.NewHydraClient("http://unused"), ory.NewKratosClient("http://unused", "http://unused"), nil, "http://unused")

	challenge := "test-challenge-abc123"
	signed := h.signChallenge(challenge)
	got := h.verifyChallenge(signed)
	if got != challenge {
		t.Fatalf("expected %q, got %q", challenge, got)
	}
}

func TestVerifyChallenge_TamperedSignature(t *testing.T) {
	h := NewOryHandler(ory.NewHydraClient("http://unused"), ory.NewKratosClient("http://unused", "http://unused"), nil, "http://unused")

	signed := h.signChallenge("real-challenge")
	// Tamper with the signature
	tampered := "real-challenge.0000000000000000000000000000000000000000000000000000000000000000"
	got := h.verifyChallenge(tampered)
	if got != "" {
		t.Fatalf("expected empty string for tampered sig, got %q", got)
	}

	// Also verify the original still works
	got = h.verifyChallenge(signed)
	if got != "real-challenge" {
		t.Fatalf("original should still verify, got %q", got)
	}
}

func TestVerifyChallenge_MissingSeparator(t *testing.T) {
	h := NewOryHandler(ory.NewHydraClient("http://unused"), ory.NewKratosClient("http://unused", "http://unused"), nil, "http://unused")

	got := h.verifyChallenge("no-dot-separator")
	if got != "" {
		t.Fatalf("expected empty string for missing separator, got %q", got)
	}
}
