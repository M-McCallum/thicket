package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/mitchell/neoncore/internal/auth"
	"github.com/mitchell/neoncore/internal/models"
)

var (
	ErrEmailTaken       = errors.New("email already taken")
	ErrUsernameTaken    = errors.New("username already taken")
	ErrInvalidEmail     = errors.New("invalid email")
	ErrInvalidUsername   = errors.New("username must be 3-32 alphanumeric characters")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidRefreshToken = errors.New("invalid or expired refresh token")
	ErrTooManySessions  = errors.New("too many active sessions")
)

var (
	usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)
	emailRegex    = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
)

const maxSessions = 5

type AuthService struct {
	queries    *models.Queries
	jwtManager *auth.JWTManager
	refreshExpiry time.Duration
}

func NewAuthService(q *models.Queries, jwtManager *auth.JWTManager, refreshExpiry time.Duration) *AuthService {
	return &AuthService{
		queries:       q,
		jwtManager:    jwtManager,
		refreshExpiry: refreshExpiry,
	}
}

type AuthTokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type SignupParams struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *AuthService) Signup(ctx context.Context, params SignupParams) (*models.User, *AuthTokens, error) {
	if !usernameRegex.MatchString(params.Username) {
		return nil, nil, ErrInvalidUsername
	}
	if !emailRegex.MatchString(params.Email) {
		return nil, nil, ErrInvalidEmail
	}

	passwordHash, err := auth.HashPassword(params.Password)
	if err != nil {
		return nil, nil, err
	}

	// Check uniqueness
	if _, err := s.queries.GetUserByEmail(ctx, params.Email); err == nil {
		return nil, nil, ErrEmailTaken
	}
	if _, err := s.queries.GetUserByUsername(ctx, params.Username); err == nil {
		return nil, nil, ErrUsernameTaken
	}

	user, err := s.queries.CreateUser(ctx, models.CreateUserParams{
		Username:     params.Username,
		Email:        params.Email,
		PasswordHash: passwordHash,
		DisplayName:  &params.Username,
	})
	if err != nil {
		return nil, nil, err
	}

	tokens, err := s.createTokens(ctx, user)
	if err != nil {
		return nil, nil, err
	}

	return &user, tokens, nil
}

type LoginParams struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *AuthService) Login(ctx context.Context, params LoginParams) (*models.User, *AuthTokens, error) {
	user, err := s.queries.GetUserByEmail(ctx, params.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, err
	}

	if !auth.CheckPassword(params.Password, user.PasswordHash) {
		return nil, nil, ErrInvalidCredentials
	}

	tokens, err := s.createTokens(ctx, user)
	if err != nil {
		return nil, nil, err
	}

	return &user, tokens, nil
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*AuthTokens, error) {
	session, err := s.queries.GetSessionByToken(ctx, refreshToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidRefreshToken
		}
		return nil, err
	}

	// Delete old session (rotation)
	if err := s.queries.DeleteSession(ctx, session.ID); err != nil {
		return nil, err
	}

	user, err := s.queries.GetUserByID(ctx, session.UserID)
	if err != nil {
		return nil, err
	}

	tokens, err := s.createTokens(ctx, user)
	if err != nil {
		return nil, err
	}

	return tokens, nil
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	return s.queries.DeleteSessionByToken(ctx, refreshToken)
}

func (s *AuthService) createTokens(ctx context.Context, user models.User) (*AuthTokens, error) {
	// Enforce session limit
	count, err := s.queries.CountUserSessions(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if count >= maxSessions {
		if err := s.queries.DeleteOldestUserSession(ctx, user.ID); err != nil {
			return nil, err
		}
	}

	accessToken, err := s.jwtManager.CreateAccessToken(user.ID, user.Username)
	if err != nil {
		return nil, err
	}

	refreshToken, err := generateRefreshToken()
	if err != nil {
		return nil, err
	}

	_, err = s.queries.CreateSession(ctx, models.CreateSessionParams{
		UserID:       user.ID,
		RefreshToken: refreshToken,
		ExpiresAt:    time.Now().Add(s.refreshExpiry),
	})
	if err != nil {
		return nil, err
	}

	return &AuthTokens{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

func generateRefreshToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
