package handler

import (
	"encoding/json"
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
)

type KeysHandler struct {
	keysSvc *service.KeysService
}

func NewKeysHandler(ks *service.KeysService) *KeysHandler {
	return &KeysHandler{keysSvc: ks}
}

// RegisterIdentityKey stores a per-device ECDH public key.
func (h *KeysHandler) RegisterIdentityKey(c fiber.Ctx) error {
	var body struct {
		DeviceID     string          `json:"device_id"`
		PublicKeyJWK json.RawMessage `json:"public_key_jwk"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	key, err := h.keysSvc.RegisterIdentityKey(c.Context(), userID, body.DeviceID, body.PublicKeyJWK)
	if err != nil {
		return handleKeysError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(key)
}

// GetUserIdentityKeys returns all device keys for a user.
func (h *KeysHandler) GetUserIdentityKeys(c fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	keys, err := h.keysSvc.GetUserIdentityKeys(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(keys)
}

// GetMyIdentityKeys returns the current user's device keys.
func (h *KeysHandler) GetMyIdentityKeys(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	keys, err := h.keysSvc.GetUserIdentityKeys(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(keys)
}

// RemoveDeviceKey removes a device key for the current user.
func (h *KeysHandler) RemoveDeviceKey(c fiber.Ctx) error {
	deviceID := c.Params("deviceId")
	if deviceID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "device_id required"})
	}

	userID := auth.GetUserID(c)
	if err := h.keysSvc.RemoveDeviceKey(c.Context(), userID, deviceID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(fiber.Map{"message": "device key removed"})
}

// StoreKeyEnvelope stores the encrypted key envelope for recovery.
func (h *KeysHandler) StoreKeyEnvelope(c fiber.Ctx) error {
	var body struct {
		Envelope []byte `json:"envelope"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	userID := auth.GetUserID(c)
	if err := h.keysSvc.StoreKeyEnvelope(c.Context(), userID, body.Envelope); err != nil {
		return handleKeysError(c, err)
	}

	return c.JSON(fiber.Map{"message": "key envelope stored"})
}

// GetKeyEnvelope retrieves the encrypted key envelope.
func (h *KeysHandler) GetKeyEnvelope(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	env, err := h.keysSvc.GetKeyEnvelope(c.Context(), userID)
	if err != nil {
		return handleKeysError(c, err)
	}

	return c.JSON(env)
}

// DeleteKeyEnvelope removes the key envelope.
func (h *KeysHandler) DeleteKeyEnvelope(c fiber.Ctx) error {
	userID := auth.GetUserID(c)
	if err := h.keysSvc.DeleteKeyEnvelope(c.Context(), userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(fiber.Map{"message": "key envelope deleted"})
}

// StoreGroupKey stores an encrypted group DM key for a user.
func (h *KeysHandler) StoreGroupKey(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("conversationId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	var body struct {
		Epoch        int    `json:"epoch"`
		UserID       string `json:"user_id"`
		EncryptedKey []byte `json:"encrypted_key"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	targetUserID, err := uuid.Parse(body.UserID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	if err := h.keysSvc.StoreGroupKey(c.Context(), conversationID, body.Epoch, targetUserID, body.EncryptedKey); err != nil {
		return handleKeysError(c, err)
	}

	return c.JSON(fiber.Map{"message": "group key stored"})
}

// GetGroupKeys retrieves group DM keys for the current user in a conversation.
func (h *KeysHandler) GetGroupKeys(c fiber.Ctx) error {
	conversationID, err := uuid.Parse(c.Params("conversationId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid conversation ID"})
	}

	userID := auth.GetUserID(c)
	keys, err := h.keysSvc.GetGroupKeys(c.Context(), conversationID, userID)
	if err != nil {
		return handleKeysError(c, err)
	}

	return c.JSON(keys)
}

func handleKeysError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, service.ErrDeviceIDRequired),
		errors.Is(err, service.ErrInvalidPublicKey):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, service.ErrKeyEnvelopeNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
}
