package handler

import (
	"errors"

	"github.com/gofiber/fiber/v3"

	"github.com/mitchell/neoncore/internal/auth"
	"github.com/mitchell/neoncore/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Signup(c fiber.Ctx) error {
	var params service.SignupParams
	if err := c.Bind().JSON(&params); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	user, tokens, err := h.authService.Signup(c.Context(), params)
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"user":          user,
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
	})
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var params service.LoginParams
	if err := c.Bind().JSON(&params); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	user, tokens, err := h.authService.Login(c.Context(), params)
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.JSON(fiber.Map{
		"user":          user,
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
	})
}

func (h *AuthHandler) Refresh(c fiber.Ctx) error {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "refresh_token is required",
		})
	}

	tokens, err := h.authService.Refresh(c.Context(), body.RefreshToken)
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.JSON(fiber.Map{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
	})
}

func (h *AuthHandler) Logout(c fiber.Ctx) error {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.Bind().JSON(&body); err != nil || body.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "refresh_token is required",
		})
	}

	if err := h.authService.Logout(c.Context(), body.RefreshToken); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to logout",
		})
	}

	return c.JSON(fiber.Map{"message": "logged out"})
}

func (h *AuthHandler) Me(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	username := auth.GetUsername(c)

	return c.JSON(fiber.Map{
		"user_id":  userID,
		"username": username,
	})
}

func handleAuthError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrEmailTaken):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrUsernameTaken):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidEmail):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidUsername):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, auth.ErrPasswordTooShort):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidCredentials):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrInvalidRefreshToken):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
