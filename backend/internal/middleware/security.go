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
		c.Set("X-XSS-Protection", "0")

		// The /auth/ pages are server-rendered HTML that load Tailwind from a
		// CDN and use inline scripts. They need a more permissive CSP than the
		// API endpoints which only serve JSON.
		path := c.Path()
		if len(path) >= 6 && path[:6] == "/auth/" {
			c.Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'")
		} else {
			c.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.giphy.com; connect-src 'self' wss://* https://*; media-src 'self' blob:; frame-ancestors 'none'")
		}

		return c.Next()
	}
}
