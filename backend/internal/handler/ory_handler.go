package handler

import (
	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/ory"
	"github.com/M-McCallum/thicket/internal/service"
)

// OryHandler handles Hydra login/consent/logout provider endpoints.
type OryHandler struct {
	hydraClient     *ory.HydraClient
	identityService *service.IdentityService
	kratosPublicURL string
}

// NewOryHandler creates an OryHandler.
func NewOryHandler(hydraClient *ory.HydraClient, identityService *service.IdentityService, kratosPublicURL string) *OryHandler {
	return &OryHandler{
		hydraClient:     hydraClient,
		identityService: identityService,
		kratosPublicURL: kratosPublicURL,
	}
}

// GetLogin handles GET /auth/login — Hydra redirects here with a login_challenge.
// If the user has already authenticated (skip=true), we auto-accept.
// Otherwise we redirect to Kratos self-service login.
func (h *OryHandler) GetLogin(c fiber.Ctx) error {
	challenge := c.Query("login_challenge")
	if challenge == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing login_challenge"})
	}

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

	// Redirect to Kratos self-service login, passing the challenge through.
	return c.Redirect().To(h.kratosPublicURL + "/self-service/login/browser?login_challenge=" + challenge)
}

// PostLogin handles POST /auth/login — called after Kratos login completes.
// Accepts the Hydra login challenge with the authenticated subject.
func (h *OryHandler) PostLogin(c fiber.Ctx) error {
	challenge := c.Query("login_challenge")
	if challenge == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing login_challenge"})
	}

	var body struct {
		Subject string `json:"subject"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.Subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing subject"})
	}

	completed, err := h.hydraClient.AcceptLogin(c.Context(), challenge, ory.AcceptLoginRequest{
		Subject:     body.Subject,
		Remember:    true,
		RememberFor: 3600,
	})
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to accept login"})
	}

	return c.Redirect().To(completed.RedirectTo)
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
			RememberFor:              3600,
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
