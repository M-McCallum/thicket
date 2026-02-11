package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashPassword(t *testing.T) {
	hash, err := HashPassword("validpassword123")
	require.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEqual(t, "validpassword123", hash)
}

func TestHashPassword_TooShort(t *testing.T) {
	_, err := HashPassword("short")
	assert.ErrorIs(t, err, ErrPasswordTooShort)
}

func TestCheckPassword_Correct(t *testing.T) {
	hash, err := HashPassword("validpassword123")
	require.NoError(t, err)

	assert.True(t, CheckPassword("validpassword123", hash))
}

func TestCheckPassword_Wrong(t *testing.T) {
	hash, err := HashPassword("validpassword123")
	require.NoError(t, err)

	assert.False(t, CheckPassword("wrongpassword", hash))
}

func TestCheckPassword_DifferentHashesForSamePassword(t *testing.T) {
	hash1, err := HashPassword("validpassword123")
	require.NoError(t, err)

	hash2, err := HashPassword("validpassword123")
	require.NoError(t, err)

	// bcrypt uses random salt, so hashes should differ
	assert.NotEqual(t, hash1, hash2)

	// But both should verify correctly
	assert.True(t, CheckPassword("validpassword123", hash1))
	assert.True(t, CheckPassword("validpassword123", hash2))
}
