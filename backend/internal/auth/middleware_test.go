package auth

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestApp(jwtManager *JWTManager) *fiber.App {
	app := fiber.New()

	app.Get("/protected", Middleware(jwtManager), func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":  GetUserID(c).String(),
			"username": GetUsername(c),
		})
	})

	return app
}

func TestMiddleware_ValidToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)
	app := setupTestApp(manager)
	userID := uuid.New()

	token, err := manager.CreateAccessToken(userID, "testuser")
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMiddleware_MissingHeader(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)
	app := setupTestApp(manager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "missing authorization header")
}

func TestMiddleware_InvalidFormat(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)
	app := setupTestApp(manager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "InvalidFormat")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "invalid authorization format")
}

func TestMiddleware_ExpiredToken(t *testing.T) {
	manager := NewJWTManager("test-secret", -1*time.Minute)
	app := setupTestApp(manager)

	token, err := manager.CreateAccessToken(uuid.New(), "testuser")
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestMiddleware_MalformedToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)
	app := setupTestApp(manager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer not.a.jwt")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
