package auth

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// BotValidator is a function that validates a bot token and returns (botID, botUsername, error).
type BotValidator func(ctx context.Context, token string) (uuid.UUID, string, error)

// BotOrUserMiddleware checks for "Bot <token>" first, then falls back to JWT auth.
// If the Authorization header starts with "Bot ", it validates the bot token.
// Otherwise, it delegates to the standard JWT middleware.
func BotOrUserMiddleware(jwksManager *JWKSManager, botValidator BotValidator) fiber.Handler {
	jwtMiddleware := Middleware(jwksManager)

	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bot" {
			// Bot token auth
			botID, botUsername, err := botValidator(c.Context(), parts[1])
			if err != nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "invalid bot token",
				})
			}
			c.Locals("userID", botID)
			c.Locals("username", botUsername)
			c.Locals("isBot", true)
			return c.Next()
		}

		// Fall back to JWT auth
		return jwtMiddleware(c)
	}
}
