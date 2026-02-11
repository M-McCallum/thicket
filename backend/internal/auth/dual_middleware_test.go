package auth_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/testutil"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupDualTestApp(jwtManager *auth.JWTManager, jwksManager *auth.JWKSManager) *fiber.App {
	app := fiber.New()

	app.Get("/protected", auth.DualMiddleware(jwtManager, jwksManager), func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":  auth.GetUserID(c).String(),
			"username": auth.GetUsername(c),
		})
	})

	return app
}

func TestDualMiddleware_RS256Token(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwtManager := auth.NewJWTManager("test-secret", 15*time.Minute)
	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupDualTestApp(jwtManager, jwksManager)

	userID := uuid.New()
	token := jwksServer.CreateToken(userID, "rsauser")

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDualMiddleware_HS256Fallback(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwtManager := auth.NewJWTManager("test-secret", 15*time.Minute)
	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupDualTestApp(jwtManager, jwksManager)

	userID := uuid.New()
	token, err := jwtManager.CreateAccessToken(userID, "legacyuser")
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDualMiddleware_MissingHeader(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwtManager := auth.NewJWTManager("test-secret", 15*time.Minute)
	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupDualTestApp(jwtManager, jwksManager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "missing authorization header")
}

func TestDualMiddleware_BothInvalid(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	jwtManager := auth.NewJWTManager("test-secret", 15*time.Minute)
	jwksManager := auth.NewJWKSManager(jwksServer.JWKSURL())
	app := setupDualTestApp(jwtManager, jwksManager)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer garbage.token.here")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
