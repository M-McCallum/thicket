package auth

import (
	"errors"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("expired token")
)

// HydraExt holds custom session data that Hydra places under the "ext" claim
// when Session.AccessToken is set during consent acceptance.
type HydraExt struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
}

type Claims struct {
	Ext HydraExt `json:"ext"`
	jwt.RegisteredClaims
}

// GetUserID returns the local DB user ID from the ext claim.
func (c *Claims) GetUserID() uuid.UUID {
	return c.Ext.UserID
}

// GetUsername returns the username from the ext claim.
func (c *Claims) GetUsername() string {
	return c.Ext.Username
}
