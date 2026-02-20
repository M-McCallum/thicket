package handler

import (
	"html/template"
	"log"

	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/ory"
	"github.com/M-McCallum/thicket/internal/service"
)

// OryHandler handles Hydra login/consent/logout provider endpoints
// and Kratos self-service UI rendering.
type OryHandler struct {
	hydraClient     *ory.HydraClient
	kratosClient    *ory.KratosClient
	identityService *service.IdentityService
	kratosPublicURL string
	loginTmpl       *template.Template
	registrationTmpl *template.Template
	errorTmpl       *template.Template
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
	return &OryHandler{
		hydraClient:      hydraClient,
		kratosClient:     kratosClient,
		identityService:  identityService,
		kratosPublicURL:  kratosPublicURL,
		loginTmpl:        mustParsePages("templates/base.html", "templates/login.html"),
		registrationTmpl: mustParsePages("templates/base.html", "templates/registration.html"),
		errorTmpl:        mustParsePages("templates/base.html", "templates/error.html"),
	}
}

// GetLogin handles GET /auth/login.
//
// Three cases:
//  1. login_challenge param → Hydra OAuth flow (redirect to Kratos with challenge)
//  2. flow param → Kratos self-service login, fetch flow and render form
//  3. Neither → redirect to Kratos to create a new login flow
func (h *OryHandler) GetLogin(c fiber.Ctx) error {
	challenge := c.Query("login_challenge")
	flowID := c.Query("flow")

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

		// No active session — redirect to Kratos self-service login, passing the challenge through.
		return c.Redirect().To(h.kratosPublicURL + "/self-service/login/browser?login_challenge=" + challenge)
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

	// Case 3: No params — start a new login flow
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
func (h *OryHandler) GetConsent(c fiber.Ctx) error {
	challenge := c.Query("consent_challenge")
	if challenge == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing consent_challenge"})
	}

	cr, err := h.hydraClient.GetConsentRequest(c.Context(), challenge)
	if err != nil {
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
