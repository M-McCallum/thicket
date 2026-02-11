package testutil

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TestJWKSServer serves a JWKS endpoint with a generated RSA keypair
// for use in tests that need RS256 token validation.
type TestJWKSServer struct {
	Server     *httptest.Server
	PrivateKey *rsa.PrivateKey
	Kid        string
}

// NewTestJWKSServer creates a new test JWKS server with a fresh RSA keypair.
func NewTestJWKSServer() *TestJWKSServer {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(fmt.Sprintf("failed to generate RSA key: %v", err))
	}

	kid := "test-key-1"

	t := &TestJWKSServer{
		PrivateKey: privateKey,
		Kid:        kid,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/jwks.json", func(w http.ResponseWriter, r *http.Request) {
		jwks := map[string]interface{}{
			"keys": []map[string]interface{}{
				{
					"kty": "RSA",
					"kid": kid,
					"use": "sig",
					"alg": "RS256",
					"n":   base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
					"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.PublicKey.E)).Bytes()),
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jwks)
	})

	t.Server = httptest.NewServer(mux)
	return t
}

// JWKSURL returns the full URL to the JWKS endpoint.
func (t *TestJWKSServer) JWKSURL() string {
	return t.Server.URL + "/.well-known/jwks.json"
}

// CreateToken creates a signed RS256 JWT with the given user ID and username.
// The token includes both custom claims (user_id, username) and standard sub claim.
func (t *TestJWKSServer) CreateToken(userID uuid.UUID, username string) string {
	return t.CreateTokenWithExpiry(userID, username, 15*time.Minute)
}

// CreateTokenWithExpiry creates a signed RS256 JWT with a custom expiry duration.
func (t *TestJWKSServer) CreateTokenWithExpiry(userID uuid.UUID, username string, expiry time.Duration) string {
	claims := jwt.MapClaims{
		"user_id":  userID.String(),
		"username": username,
		"sub":      userID.String(),
		"iss":      "test-hydra",
		"aud":      []string{"api.thicket.chat"},
		"exp":      time.Now().Add(expiry).Unix(),
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = t.Kid

	signed, err := token.SignedString(t.PrivateKey)
	if err != nil {
		panic(fmt.Sprintf("failed to sign token: %v", err))
	}
	return signed
}

// CreateExpiredToken creates a signed RS256 JWT that is already expired.
func (t *TestJWKSServer) CreateExpiredToken(userID uuid.UUID, username string) string {
	return t.CreateTokenWithExpiry(userID, username, -1*time.Hour)
}

// CreateTokenWithSubOnly creates a signed RS256 JWT with only standard claims (no user_id/username).
// Simulates a Hydra token before custom claims are added in the consent endpoint.
func (t *TestJWKSServer) CreateTokenWithSubOnly(subject uuid.UUID) string {
	claims := jwt.MapClaims{
		"sub": subject.String(),
		"iss": "test-hydra",
		"aud": []string{"api.thicket.chat"},
		"exp": time.Now().Add(15 * time.Minute).Unix(),
		"iat": time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = t.Kid

	signed, err := token.SignedString(t.PrivateKey)
	if err != nil {
		panic(fmt.Sprintf("failed to sign token: %v", err))
	}
	return signed
}

// Close shuts down the test JWKS server.
func (t *TestJWKSServer) Close() {
	t.Server.Close()
}
