package auth_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/testutil"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestApp(jwksManager *auth.JWKSManager) *fiber.App {
	app := fiber.New()

	app.Get("/protected", auth.Middleware(jwksManager), func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":  auth.GetUserID(c).String(),
			"username": auth.GetUsername(c),
		})
	})

	return app
}

func TestMiddleware_ValidRS256Token(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupTestApp(jwksManager)
	userID := uuid.New()

	token := jwksServer.CreateToken(userID, "testuser")

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMiddleware_MissingHeader(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupTestApp(jwksManager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "missing authorization header")
}

func TestMiddleware_InvalidFormat(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupTestApp(jwksManager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "InvalidFormat")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "invalid authorization format")
}

func TestMiddleware_ExpiredToken(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupTestApp(jwksManager)

	token := jwksServer.CreateExpiredToken(uuid.New(), "testuser")

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestMiddleware_MalformedToken(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupTestApp(jwksManager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer not.a.jwt")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
