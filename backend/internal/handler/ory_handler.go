package handler

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"html/template"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/ory"
	"github.com/M-McCallum/thicket/internal/service"
)

// storedChallenge holds a consent challenge mapped to a short ID with an expiry.
type storedChallenge struct {
	challenge string
	expiresAt time.Time
}

// challengeStore is a short-lived in-memory map from short IDs to consent challenges.
// It shortens the consent URL to avoid Google Safe Browsing false positives.
type challengeStore struct {
	mu      sync.Mutex
	entries map[string]storedChallenge
}

func newChallengeStore() *challengeStore {
	return &challengeStore{entries: make(map[string]storedChallenge)}
}

// put stores a challenge under a new random short ID and returns the ID.
// It also lazily purges expired entries.
func (s *challengeStore) put(challenge string) string {
	// Copy the string — Fiber/fasthttp returns query values backed by a
	// reusable buffer, so the bytes would be overwritten on the next request.
	challenge = strings.Clone(challenge)

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("Failed to generate random short ID: %v", err)
	}
	id := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()

	// Lazy cleanup of expired entries.
	now := time.Now()
	for k, v := range s.entries {
		if now.After(v.expiresAt) {
			delete(s.entries, k)
		}
	}

	s.entries[id] = storedChallenge{
		challenge: challenge,
		expiresAt: now.Add(5 * time.Minute),
	}
	return id
}

// take retrieves and deletes a challenge by short ID. Returns "" if not found or expired.
func (s *challengeStore) take(id string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.entries[id]
	if !ok {
		return ""
	}
	delete(s.entries, id)

	if time.Now().After(entry.expiresAt) {
		return ""
	}
	return entry.challenge
}

// OryHandler handles Hydra login/consent/logout provider endpoints
// and Kratos self-service UI rendering.
type OryHandler struct {
	hydraClient      *ory.HydraClient
	kratosClient     *ory.KratosClient
	identityService  *service.IdentityService
	kratosPublicURL  string
	cookieHMACKey    []byte // random key generated at startup to sign challenge cookies
	consentStore     *challengeStore
	loginStore       *challengeStore
	loginTmpl        *template.Template
	registrationTmpl *template.Template
	errorTmpl        *template.Template
}

// mustParsePages parses the base template together with a specific page template
// so that each page gets its own copy of the block definitions.
func mustParsePages(base, page string) *template.Template {
	tmpl, err := template.ParseFS(templateFS, base, page)
	if err != nil {
		log.Fatalf("Failed to parse templates %s + %s: %v", base, page, err)
	}
	return tmpl
}

// NewOryHandler creates an OryHandler.
func NewOryHandler(hydraClient *ory.HydraClient, kratosClient *ory.KratosClient, identityService *service.IdentityService, kratosPublicURL string) *OryHandler {
	// Generate a random 32-byte HMAC key for signing the login challenge cookie.
	// This key lives only in memory — any in-flight challenges are invalidated on
	// restart, which is acceptable since the cookie TTL is only 10 minutes.
	hmacKey := make([]byte, 32)
	if _, err := rand.Read(hmacKey); err != nil {
		log.Fatalf("Failed to generate HMAC key: %v", err)
	}

	return &OryHandler{
		hydraClient:      hydraClient,
		kratosClient:     kratosClient,
		identityService:  identityService,
		kratosPublicURL:  kratosPublicURL,
		cookieHMACKey:    hmacKey,
		consentStore:     newChallengeStore(),
		loginStore:       newChallengeStore(),
		loginTmpl:        mustParsePages("templates/base.html", "templates/login.html"),
		registrationTmpl: mustParsePages("templates/base.html", "templates/registration.html"),
		errorTmpl:        mustParsePages("templates/base.html", "templates/error.html"),
	}
}

// signChallenge returns "challenge.hex(hmac)" so the cookie value is tamper-proof.
func (h *OryHandler) signChallenge(challenge string) string {
	mac := hmac.New(sha256.New, h.cookieHMACKey)
	mac.Write([]byte(challenge))
	sig := hex.EncodeToString(mac.Sum(nil))
	return challenge + "." + sig
}

// verifyChallenge splits the signed cookie value and verifies the HMAC.
// Returns the original challenge if valid, or "" if tampered/malformed.
func (h *OryHandler) verifyChallenge(signed string) string {
	parts := strings.SplitN(signed, ".", 2)
	if len(parts) != 2 {
		return ""
	}
	challenge, sig := parts[0], parts[1]
	mac := hmac.New(sha256.New, h.cookieHMACKey)
	mac.Write([]byte(challenge))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return ""
	}
	return challenge
}

// GetLogin handles GET /auth/login.
//
// Three cases:
//  1. login_challenge param → Hydra OAuth flow (redirect to Kratos with challenge)
//  2. flow param → Kratos self-service login, fetch flow and render form
//  3. Neither → check for saved challenge cookie (OIDC roundtrip recovery),
//     otherwise redirect to Kratos to create a new login flow
func (h *OryHandler) GetLogin(c fiber.Ctx) error {
	challenge := c.Query("login_challenge")
	flowID := c.Query("flow")

	// Phase 1: Long challenge from Hydra → store under short ID and redirect.
	// This keeps the browser URL short to avoid Google Safe Browsing false positives.
	if challenge != "" && c.Query("id") == "" {
		id := h.loginStore.put(challenge)
		return c.Redirect().To("/auth/login?id=" + id)
	}

	// Phase 2: Short ID → resolve the real challenge.
	if shortID := c.Query("id"); shortID != "" {
		challenge = h.loginStore.take(shortID)
		if challenge == "" {
			return c.Redirect().To(h.kratosPublicURL + "/self-service/login/browser")
		}
	}

	// Case 1: Hydra login challenge — existing OAuth flow
	if challenge != "" {
		lr, err := h.hydraClient.GetLoginRequest(c.Context(), challenge)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to fetch login request"})
		}

		if lr.Skip {
			completed, err := h.hydraClient.AcceptLogin(c.Context(), challenge, ory.AcceptLoginRequest{
				Subject: lr.Subject,
			})
			if err != nil {
				return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to accept login"})
			}
			return c.Redirect().To(completed.RedirectTo)
		}

		// Check if the user already has a Kratos session (e.g. from recent registration).
		// If so, accept the Hydra login automatically — no need to re-enter credentials.
		cookie := c.Get("Cookie")
		if session, err := h.kratosClient.WhoAmI(c.Context(), cookie); err == nil && session.Active {
			completed, err := h.hydraClient.AcceptLogin(c.Context(), challenge, ory.AcceptLoginRequest{
				Subject:     session.Identity.ID,
				Remember:    true,
				RememberFor: 2592000,
			})
			if err != nil {
				return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to accept login"})
			}
			return c.Redirect().To(completed.RedirectTo)
		}

		// Save the HMAC-signed challenge in a cookie so we can recover it after
		// OIDC roundtrips where Kratos may redirect back without the login_challenge.
		c.Cookie(&fiber.Cookie{
			Name:     "hydra_login_challenge",
			Value:    h.signChallenge(challenge),
			Path:     "/auth/login",
			HTTPOnly: true,
			Secure:   strings.HasPrefix(h.kratosPublicURL, "https"),
			SameSite: "Lax",
			MaxAge:   600, // 10 minutes — matches Kratos login flow lifespan
		})

		// No active session — redirect to Kratos self-service login.
		// Pass login_challenge for Kratos's oauth2_provider integration, and also
		// set return_to so that even if Kratos loses the challenge (e.g. during
		// OIDC auto-registration), the browser comes back here with the challenge
		// in the URL rather than the bare default_browser_return_url.
		returnTo := h.kratosPublicURL + "/auth/login"
		kratosURL := h.kratosPublicURL + "/self-service/login/browser?login_challenge=" + url.QueryEscape(challenge) +
			"&return_to=" + url.QueryEscape(returnTo)
		return c.Redirect().To(kratosURL)
	}

	// Case 2: Kratos self-service login flow — render form
	if flowID != "" {
		cookie := c.Get("Cookie")
		flow, err := h.kratosClient.GetLoginFlow(c.Context(), flowID, cookie)
		if err != nil {
			c.Set("Content-Type", "text/html; charset=utf-8")
			return h.errorTmpl.ExecuteTemplate(c, "base", struct {
				Flow     interface{}
				Error    string
				RetryURL string
			}{nil, "Your login session has expired or is invalid. Please try again.", "/auth/login"})
		}

		c.Set("Content-Type", "text/html; charset=utf-8")
		return h.loginTmpl.ExecuteTemplate(c, "base", struct {
			Flow *ory.SelfServiceFlow
		}{flow})
	}

	// Case 3: No params — recover from OIDC roundtrip if possible.
	// After OIDC (e.g. Discord) completes, Kratos may redirect here without
	// the login_challenge. If the user now has an active Kratos session and
	// we saved the challenge in a signed cookie, we can complete the Hydra login.
	signedChallenge := c.Cookies("hydra_login_challenge")
	savedChallenge := h.verifyChallenge(signedChallenge)
	if savedChallenge != "" {
		cookie := c.Get("Cookie")
		if session, err := h.kratosClient.WhoAmI(c.Context(), cookie); err == nil && session.Active {
			// Clear the cookie immediately — one attempt only.
			c.Cookie(&fiber.Cookie{
				Name:     "hydra_login_challenge",
				Value:    "",
				Path:     "/auth/login",
				HTTPOnly: true,
				Secure:   strings.HasPrefix(h.kratosPublicURL, "https"),
				SameSite: "Lax",
				MaxAge:   -1,
			})

			// Verify the challenge is still a pending login request in Hydra
			// before accepting. This prevents replay of expired/used challenges.
			lr, err := h.hydraClient.GetLoginRequest(c.Context(), savedChallenge)
			if err != nil {
				log.Printf("Saved login challenge is no longer valid: %v", err)
				// Fall through to start a fresh login flow.
			} else {
				completed, err := h.hydraClient.AcceptLogin(c.Context(), savedChallenge, ory.AcceptLoginRequest{
					Subject:     session.Identity.ID,
					Remember:    true,
					RememberFor: 2592000,
				})
				if err != nil {
					log.Printf("Failed to accept Hydra login with saved challenge (client=%s): %v", lr.Client.ClientID, err)
					// Fall through to start a fresh login flow.
				} else {
					return c.Redirect().To(completed.RedirectTo)
				}
			}
		}
	}

	// Before redirecting to Kratos, check if the user already has an active
	// session. If so, redirecting to Kratos would loop (Kratos sees the session
	// and sends them back here). Show the login form instead so they can
	// restart the OAuth flow or log in with a different method.
	cookie := c.Get("Cookie")
	if session, err := h.kratosClient.WhoAmI(c.Context(), cookie); err == nil && session.Active {
		log.Printf("Active Kratos session for %s but no login_challenge — cannot complete OAuth flow, showing login page", session.Identity.ID)
		c.Set("Content-Type", "text/html; charset=utf-8")
		return h.errorTmpl.ExecuteTemplate(c, "base", struct {
			Flow     interface{}
			Error    string
			RetryURL string
		}{nil, "Your login session expired before it could be completed. Please try again.", "/auth/login"})
	}

	// No active session — start a new login flow.
	return c.Redirect().To(h.kratosPublicURL + "/self-service/login/browser")
}

// GetRegistration handles GET /auth/registration.
//
// Two cases:
//  1. flow param → fetch registration flow from Kratos, render form
//  2. No flow → redirect to Kratos to create a new registration flow
func (h *OryHandler) GetRegistration(c fiber.Ctx) error {
	flowID := c.Query("flow")

	if flowID != "" {
		cookie := c.Get("Cookie")
		flow, err := h.kratosClient.GetRegistrationFlow(c.Context(), flowID, cookie)
		if err != nil {
			c.Set("Content-Type", "text/html; charset=utf-8")
			return h.errorTmpl.ExecuteTemplate(c, "base", struct {
				Flow     interface{}
				Error    string
				RetryURL string
			}{nil, "Your registration session has expired or is invalid. Please try again.", "/auth/registration"})
		}

		c.Set("Content-Type", "text/html; charset=utf-8")
		return h.registrationTmpl.ExecuteTemplate(c, "base", struct {
			Flow *ory.SelfServiceFlow
		}{flow})
	}

	// No flow param — start a new registration flow
	return c.Redirect().To(h.kratosPublicURL + "/self-service/registration/browser")
}

// GetConsent handles GET /auth/consent — Hydra redirects here with a consent_challenge.
// First-party clients (metadata.is_first_party = true) are auto-accepted.
//
// Two-phase redirect: Hydra's consent_challenge tokens are ~1KB which triggers
// Google Safe Browsing phishing heuristics. Phase 1 stores the challenge under
// a short random ID and redirects to /auth/consent?id=<short>. Phase 2 looks up
// the real challenge from the short ID and proceeds normally.
func (h *OryHandler) GetConsent(c fiber.Ctx) error {
	challenge := c.Query("consent_challenge")
	shortID := c.Query("id")

	// Phase 1: Long challenge from Hydra → store and redirect to short URL.
	if challenge != "" {
		id := h.consentStore.put(challenge)
		return c.Redirect().To("/auth/consent?id=" + id)
	}

	// Phase 2: Short ID → look up real challenge.
	if shortID != "" {
		challenge = h.consentStore.take(shortID)
	}

	if challenge == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing or expired consent challenge"})
	}

	cr, err := h.hydraClient.GetConsentRequest(c.Context(), challenge)
	if err != nil {
		log.Printf("GetConsentRequest failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to fetch consent request"})
	}

	// Auto-accept for first-party clients or previously consented scopes.
	if cr.Skip || isFirstParty(cr.Client) {
		// Find or create local user from Kratos identity.
		user, err := h.identityService.FindOrCreateUser(c.Context(), cr.Subject)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to sync user"})
		}

		completed, err := h.hydraClient.AcceptConsent(c.Context(), challenge, ory.AcceptConsentRequest{
			GrantScope:               cr.RequestedScope,
			GrantAccessTokenAudience: cr.RequestedAccessTokenAudience,
			Remember:                 true,
			RememberFor:              2592000,
			Session: &ory.ConsentSession{
				AccessToken: map[string]interface{}{
					"user_id":  user.ID.String(),
					"username": user.Username,
				},
				IDToken: map[string]interface{}{
					"user_id":  user.ID.String(),
					"username": user.Username,
					"email":    user.Email,
				},
			},
		})
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to accept consent"})
		}

		return c.Redirect().To(completed.RedirectTo)
	}

	// Non-first-party clients would show a consent UI. For now, reject.
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "third-party consent not implemented"})
}

// GetLogout handles GET /auth/logout — Hydra redirects here with a logout_challenge.
func (h *OryHandler) GetLogout(c fiber.Ctx) error {
	challenge := c.Query("logout_challenge")
	if challenge == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing logout_challenge"})
	}

	completed, err := h.hydraClient.AcceptLogout(c.Context(), challenge)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to accept logout"})
	}

	return c.Redirect().To(completed.RedirectTo)
}

// GetError handles GET /auth/error — Kratos redirects here with an ?id= query parameter
// when a self-service flow encounters an error.
func (h *OryHandler) GetError(c fiber.Ctx) error {
	errorID := c.Query("id")

	errorMsg := "An unknown error occurred. Please try again."
	if errorID != "" {
		if sseErr, err := h.kratosClient.GetSelfServiceError(c.Context(), errorID); err == nil {
			if sseErr.Error.Message != "" {
				errorMsg = sseErr.Error.Message
			}
			if sseErr.Error.Reason != "" {
				errorMsg = sseErr.Error.Reason
			}
		}
	}

	c.Set("Content-Type", "text/html; charset=utf-8")
	return h.errorTmpl.ExecuteTemplate(c, "base", struct {
		Flow     interface{}
		Error    string
		RetryURL string
	}{nil, errorMsg, "/auth/login"})
}

// isFirstParty checks if the OAuth2 client is marked as first-party.
func isFirstParty(client ory.OAuth2Client) bool {
	if client.Metadata == nil {
		return false
	}
	v, ok := client.Metadata["is_first_party"]
	if !ok {
		return false
	}
	b, ok := v.(bool)
	return ok && b
}
