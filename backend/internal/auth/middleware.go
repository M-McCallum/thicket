package auth

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// Middleware validates RS256 tokens via JWKS (Ory Hydra).
func Middleware(jwksManager *JWKSManager) fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization format",
			})
		}

		claims, err := jwksManager.ValidateToken(parts[1])
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		c.Locals("userID", claims.UserID)
		c.Locals("username", claims.Username)
		return c.Next()
	}
}

func GetUserID(c fiber.Ctx) uuid.UUID {
	id, _ := c.Locals("userID").(uuid.UUID)
	return id
}

func GetUsername(c fiber.Ctx) string {
	username, _ := c.Locals("username").(string)
	return username
}
