package auth_test

import (
	"testing"
	"time"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJWKSManager_ValidateToken(t *testing.T) {
	jwksServer := testutil.NewTestJWKSServer()
	defer jwksServer.Close()

	manager := auth.NewJWKSManager(jwksServer.JWKSURL())

	t.Run("valid token", func(t *testing.T) {
		userID := uuid.New()
		username := "testuser"
		token := jwksServer.CreateToken(userID, username)

		claims, err := manager.ValidateToken(token)
		require.NoError(t, err)
		assert.Equal(t, userID, claims.UserID)
		assert.Equal(t, username, claims.Username)
	})

	t.Run("expired token", func(t *testing.T) {
		userID := uuid.New()
		token := jwksServer.CreateExpiredToken(userID, "testuser")

		_, err := manager.ValidateToken(token)
		assert.ErrorIs(t, err, auth.ErrExpiredToken)
	})

	t.Run("invalid signature", func(t *testing.T) {
		// Create a second JWKS server with different keys
		otherServer := testutil.NewTestJWKSServer()
		defer otherServer.Close()

		// Token signed with a different key
		token := otherServer.CreateToken(uuid.New(), "testuser")

		_, err := manager.ValidateToken(token)
		assert.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	t.Run("HS256 token rejected", func(t *testing.T) {
		// Create an HS256 token — the JWKS manager should reject it
		jwtManager := auth.NewJWTManager("test-secret", 15*time.Minute)
		token, err := jwtManager.CreateAccessToken(uuid.New(), "testuser")
		require.NoError(t, err)

		_, err = manager.ValidateToken(token)
		assert.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	t.Run("empty token", func(t *testing.T) {
		_, err := manager.ValidateToken("")
		assert.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	t.Run("malformed token", func(t *testing.T) {
		_, err := manager.ValidateToken("not.a.token")
		assert.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	t.Run("sub-only token populates UserID", func(t *testing.T) {
		// Simulate a Hydra token where user_id is not set but sub is a UUID
		jwksServer2 := testutil.NewTestJWKSServer()
		defer jwksServer2.Close()
		manager2 := auth.NewJWKSManager(jwksServer2.JWKSURL())

		kratosID := uuid.New()
		token := jwksServer2.CreateTokenWithSubOnly(kratosID)

		claims, err := manager2.ValidateToken(token)
		require.NoError(t, err)
		assert.Equal(t, kratosID, claims.UserID)
	})
}
