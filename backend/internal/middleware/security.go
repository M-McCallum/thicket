package middleware

import (
	"github.com/gofiber/fiber/v3"
)

// SecurityHeaders adds standard security headers to all responses.
func SecurityHeaders() fiber.Handler {
	return func(c fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
		c.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.giphy.com; connect-src 'self' wss://* https://*; media-src 'self' blob:; frame-ancestors 'none'")
		c.Set("X-XSS-Protection", "0")
		return c.Next()
	}
}
