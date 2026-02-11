package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateAccessToken(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)
	userID := uuid.New()

	token, err := manager.CreateAccessToken(userID, "testuser")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
}

func TestValidateToken_Valid(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)
	userID := uuid.New()

	token, err := manager.CreateAccessToken(userID, "testuser")
	require.NoError(t, err)

	claims, err := manager.ValidateToken(token)
	require.NoError(t, err)
	assert.Equal(t, userID, claims.UserID)
	assert.Equal(t, "testuser", claims.Username)
	assert.Equal(t, "thicket", claims.Issuer)
}

func TestValidateToken_Expired(t *testing.T) {
	manager := NewJWTManager("test-secret", -1*time.Minute)
	userID := uuid.New()

	token, err := manager.CreateAccessToken(userID, "testuser")
	require.NoError(t, err)

	_, err = manager.ValidateToken(token)
	assert.ErrorIs(t, err, ErrExpiredToken)
}

func TestValidateToken_Invalid(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)

	_, err := manager.ValidateToken("invalid-token")
	assert.ErrorIs(t, err, ErrInvalidToken)
}

func TestValidateToken_WrongSecret(t *testing.T) {
	manager1 := NewJWTManager("secret-1", 15*time.Minute)
	manager2 := NewJWTManager("secret-2", 15*time.Minute)

	token, err := manager1.CreateAccessToken(uuid.New(), "testuser")
	require.NoError(t, err)

	_, err = manager2.ValidateToken(token)
	assert.ErrorIs(t, err, ErrInvalidToken)
}

func TestValidateToken_Tampered(t *testing.T) {
	manager := NewJWTManager("test-secret", 15*time.Minute)

	token, err := manager.CreateAccessToken(uuid.New(), "testuser")
	require.NoError(t, err)

	// Tamper with the token
	tampered := token[:len(token)-5] + "XXXXX"
	_, err = manager.ValidateToken(tampered)
	assert.ErrorIs(t, err, ErrInvalidToken)
}
