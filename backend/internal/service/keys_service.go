package service

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrInvalidPublicKey = errors.New("invalid public key JWK")
	ErrDeviceIDRequired = errors.New("device_id is required")
	ErrKeyEnvelopeNotFound = errors.New("key envelope not found")
)

type KeysService struct {
	queries *models.Queries
}

func NewKeysService(q *models.Queries) *KeysService {
	return &KeysService{queries: q}
}

// RegisterIdentityKey stores (or updates) a device's public identity key.
func (s *KeysService) RegisterIdentityKey(ctx context.Context, userID uuid.UUID, deviceID string, publicKeyJWK json.RawMessage) (*models.UserIdentityKey, error) {
	if deviceID == "" {
		return nil, ErrDeviceIDRequired
	}
	if len(publicKeyJWK) == 0 || !json.Valid(publicKeyJWK) {
		return nil, ErrInvalidPublicKey
	}

	key, err := s.queries.CreateIdentityKey(ctx, models.CreateIdentityKeyParams{
		UserID:       userID,
		DeviceID:     deviceID,
		PublicKeyJWK: publicKeyJWK,
	})
	if err != nil {
		return nil, err
	}
	return &key, nil
}

// GetUserIdentityKeys returns all device keys for a user.
func (s *KeysService) GetUserIdentityKeys(ctx context.Context, userID uuid.UUID) ([]models.UserIdentityKey, error) {
	return s.queries.GetIdentityKeysByUser(ctx, userID)
}

// RemoveDeviceKey removes a specific device key for the current user.
func (s *KeysService) RemoveDeviceKey(ctx context.Context, userID uuid.UUID, deviceID string) error {
	return s.queries.DeleteIdentityKey(ctx, userID, deviceID)
}

// StoreKeyEnvelope stores an encrypted key envelope for passphrase/OPAQUE recovery.
func (s *KeysService) StoreKeyEnvelope(ctx context.Context, userID uuid.UUID, envelope []byte) error {
	if len(envelope) == 0 {
		return errors.New("envelope cannot be empty")
	}
	return s.queries.UpsertKeyEnvelope(ctx, userID, envelope)
}

// GetKeyEnvelope retrieves the encrypted key envelope for a user.
func (s *KeysService) GetKeyEnvelope(ctx context.Context, userID uuid.UUID) (*models.UserKeyEnvelope, error) {
	env, err := s.queries.GetKeyEnvelope(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKeyEnvelopeNotFound
		}
		return nil, err
	}
	return &env, nil
}

// DeleteKeyEnvelope removes the key envelope (when user resets E2EE).
func (s *KeysService) DeleteKeyEnvelope(ctx context.Context, userID uuid.UUID) error {
	return s.queries.DeleteKeyEnvelope(ctx, userID)
}

// EnableEncryption marks a DM conversation as encrypted.
func (s *KeysService) EnableEncryption(ctx context.Context, conversationID uuid.UUID) error {
	return s.queries.SetDMConversationEncrypted(ctx, conversationID, true)
}

// StoreGroupKey stores an encrypted group key for a user in a conversation epoch.
func (s *KeysService) StoreGroupKey(ctx context.Context, conversationID uuid.UUID, epoch int, userID uuid.UUID, encryptedKey []byte) error {
	_, err := s.queries.CreateDMKeyDistribution(ctx, conversationID, epoch, userID, encryptedKey)
	return err
}

// GetGroupKeys retrieves all key epochs for a user in a conversation.
func (s *KeysService) GetGroupKeys(ctx context.Context, conversationID, userID uuid.UUID) ([]models.DMKeyDistribution, error) {
	return s.queries.GetDMKeyDistributions(ctx, conversationID, userID)
}
