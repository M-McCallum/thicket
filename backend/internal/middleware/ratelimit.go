package middleware

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type entry struct {
	count     int
	expiresAt time.Time
}

type limiterStore struct {
	mu    sync.Mutex
	items map[string]*entry
}

func newLimiterStore() *limiterStore {
	s := &limiterStore{items: make(map[string]*entry)}
	go s.cleanup()
	return s
}

func (s *limiterStore) cleanup() {
	ticker := time.NewTicker(time.Minute)
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for k, v := range s.items {
			if now.After(v.expiresAt) {
				delete(s.items, k)
			}
		}
		s.mu.Unlock()
	}
}

// increment returns the current count after incrementing, and whether the window is new.
func (s *limiterStore) increment(key string, window time.Duration) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	e, ok := s.items[key]
	if !ok || now.After(e.expiresAt) {
		s.items[key] = &entry{count: 1, expiresAt: now.Add(window)}
		return 1
	}
	e.count++
	return e.count
}

// RateLimitConfig configures a rate limiter.
type RateLimitConfig struct {
	Max    int           // Maximum requests per window
	Window time.Duration // Time window
	// KeyFunc returns the key to rate limit on. Defaults to IP.
	KeyFunc func(c fiber.Ctx) string
}

// RateLimit creates a rate limiting middleware.
func RateLimit(cfg RateLimitConfig) fiber.Handler {
	store := newLimiterStore()

	keyFunc := cfg.KeyFunc
	if keyFunc == nil {
		keyFunc = func(c fiber.Ctx) string {
			return c.IP()
		}
	}

	return func(c fiber.Ctx) error {
		key := keyFunc(c)
		count := store.increment(key, cfg.Window)
		if count > cfg.Max {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "rate limit exceeded",
			})
		}
		return c.Next()
	}
}

// UserKeyFunc returns user ID if authenticated, falls back to IP.
func UserKeyFunc(c fiber.Ctx) string {
	if uid, ok := c.Locals("userID").(uuid.UUID); ok && uid != uuid.Nil {
		return "u:" + uid.String()
	}
	return "ip:" + c.IP()
}

// UserChannelKeyFunc returns user ID + channel ID for per-user-per-channel limits.
func UserChannelKeyFunc(c fiber.Ctx) string {
	uid := uuid.Nil
	if u, ok := c.Locals("userID").(uuid.UUID); ok {
		uid = u
	}
	channelID := c.Params("channelId")
	if channelID == "" {
		channelID = c.Params("id")
	}
	return "u:" + uid.String() + ":ch:" + channelID
}
