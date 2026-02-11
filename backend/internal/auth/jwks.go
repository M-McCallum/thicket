package auth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	defaultCacheTTL    = 5 * time.Minute
	defaultHTTPTimeout = 10 * time.Second
)

// JWKSManager validates RS256 JWTs using public keys fetched from a JWKS endpoint.
type JWKSManager struct {
	jwksURL     string
	keys        map[string]*rsa.PublicKey
	mu          sync.RWMutex
	lastFetched time.Time
	cacheTTL    time.Duration
	client      *http.Client
}

// jwksResponse represents the JSON Web Key Set response.
type jwksResponse struct {
	Keys []jwkKey `json:"keys"`
}

type jwkKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func NewJWKSManager(jwksURL string) *JWKSManager {
	return &JWKSManager{
		jwksURL:  jwksURL,
		keys:     make(map[string]*rsa.PublicKey),
		cacheTTL: defaultCacheTTL,
		client: &http.Client{
			Timeout: defaultHTTPTimeout,
		},
	}
}

// ValidateToken validates an RS256 JWT and returns claims.
// The token's sub claim contains the Kratos identity UUID.
// Custom claims user_id and username may be present if set by the consent endpoint.
func (m *JWKSManager) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("%w: unexpected signing method %v", ErrInvalidToken, token.Header["alg"])
		}

		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" {
			return nil, fmt.Errorf("%w: missing kid in token header", ErrInvalidToken)
		}

		key, err := m.getKey(kid)
		if err != nil {
			return nil, err
		}
		return key, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	// If user_id wasn't in the token claims but sub is a valid UUID,
	// populate UserID from sub (Kratos identity UUID) for downstream lookup.
	if claims.UserID == uuid.Nil && claims.Subject != "" {
		if subUUID, err := uuid.Parse(claims.Subject); err == nil {
			claims.UserID = subUUID
		}
	}

	return claims, nil
}

// getKey retrieves the RSA public key for the given kid, fetching from the JWKS
// endpoint if the key is not cached or the cache has expired.
func (m *JWKSManager) getKey(kid string) (*rsa.PublicKey, error) {
	m.mu.RLock()
	key, found := m.keys[kid]
	expired := time.Since(m.lastFetched) > m.cacheTTL
	m.mu.RUnlock()

	if found && !expired {
		return key, nil
	}

	// Key not found or cache expired — refresh keys.
	if err := m.fetchKeys(); err != nil {
		return nil, fmt.Errorf("%w: failed to fetch JWKS: %v", ErrInvalidToken, err)
	}

	m.mu.RLock()
	key, found = m.keys[kid]
	m.mu.RUnlock()

	if !found {
		return nil, fmt.Errorf("%w: unknown kid %q", ErrInvalidToken, kid)
	}
	return key, nil
}

// fetchKeys fetches the JWKS from the configured URL and updates the key cache.
func (m *JWKSManager) fetchKeys() error {
	resp, err := m.client.Get(m.jwksURL)
	if err != nil {
		return fmt.Errorf("JWKS request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS endpoint returned status %d", resp.StatusCode)
	}

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("failed to decode JWKS response: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" || k.Use != "sig" {
			continue
		}
		pubKey, err := parseRSAPublicKey(k.N, k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = pubKey
	}

	m.mu.Lock()
	m.keys = keys
	m.lastFetched = time.Now()
	m.mu.Unlock()

	return nil
}

// parseRSAPublicKey constructs an RSA public key from base64url-encoded n and e values.
func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nStr)
	if err != nil {
		return nil, fmt.Errorf("failed to decode modulus: %w", err)
	}

	eBytes, err := base64.RawURLEncoding.DecodeString(eStr)
	if err != nil {
		return nil, fmt.Errorf("failed to decode exponent: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	e := new(big.Int).SetBytes(eBytes)

	return &rsa.PublicKey{
		N: n,
		E: int(e.Int64()),
	}, nil
}
