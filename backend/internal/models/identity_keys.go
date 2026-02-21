package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type UserIdentityKey struct {
	ID           uuid.UUID       `json:"id"`
	UserID       uuid.UUID       `json:"user_id"`
	DeviceID     string          `json:"device_id"`
	PublicKeyJWK json.RawMessage `json:"public_key_jwk"`
	CreatedAt    time.Time       `json:"created_at"`
}

type CreateIdentityKeyParams struct {
	UserID       uuid.UUID
	DeviceID     string
	PublicKeyJWK json.RawMessage
}

func (q *Queries) CreateIdentityKey(ctx context.Context, arg CreateIdentityKeyParams) (UserIdentityKey, error) {
	var k UserIdentityKey
	err := q.db.QueryRow(ctx,
		`INSERT INTO user_identity_keys (user_id, device_id, public_key_jwk)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, device_id) DO UPDATE SET public_key_jwk = EXCLUDED.public_key_jwk
		RETURNING id, user_id, device_id, public_key_jwk, created_at`,
		arg.UserID, arg.DeviceID, arg.PublicKeyJWK,
	).Scan(&k.ID, &k.UserID, &k.DeviceID, &k.PublicKeyJWK, &k.CreatedAt)
	return k, err
}

func (q *Queries) GetIdentityKeysByUser(ctx context.Context, userID uuid.UUID) ([]UserIdentityKey, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, user_id, device_id, public_key_jwk, created_at
		FROM user_identity_keys WHERE user_id = $1 ORDER BY created_at ASC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []UserIdentityKey
	for rows.Next() {
		var k UserIdentityKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.DeviceID, &k.PublicKeyJWK, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	if keys == nil {
		keys = []UserIdentityKey{}
	}
	return keys, rows.Err()
}

func (q *Queries) DeleteIdentityKey(ctx context.Context, userID uuid.UUID, deviceID string) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM user_identity_keys WHERE user_id = $1 AND device_id = $2`,
		userID, deviceID,
	)
	return err
}

func (q *Queries) DeleteAllIdentityKeys(ctx context.Context, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM user_identity_keys WHERE user_id = $1`, userID)
	return err
}

// Key envelope CRUD for OPAQUE/passphrase key recovery

type UserKeyEnvelope struct {
	UserID    uuid.UUID `json:"user_id"`
	Envelope  []byte    `json:"envelope"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (q *Queries) UpsertKeyEnvelope(ctx context.Context, userID uuid.UUID, envelope []byte) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO user_key_envelopes (user_id, envelope, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (user_id) DO UPDATE SET envelope = EXCLUDED.envelope, updated_at = now()`,
		userID, envelope,
	)
	return err
}

func (q *Queries) GetKeyEnvelope(ctx context.Context, userID uuid.UUID) (UserKeyEnvelope, error) {
	var e UserKeyEnvelope
	err := q.db.QueryRow(ctx,
		`SELECT user_id, envelope, updated_at FROM user_key_envelopes WHERE user_id = $1`,
		userID,
	).Scan(&e.UserID, &e.Envelope, &e.UpdatedAt)
	return e, err
}

func (q *Queries) DeleteKeyEnvelope(ctx context.Context, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM user_key_envelopes WHERE user_id = $1`, userID)
	return err
}

// DM key distributions for group E2EE

type DMKeyDistribution struct {
	ID             uuid.UUID `json:"id"`
	ConversationID uuid.UUID `json:"conversation_id"`
	Epoch          int       `json:"epoch"`
	UserID         uuid.UUID `json:"user_id"`
	EncryptedKey   []byte    `json:"encrypted_key"`
	CreatedAt      time.Time `json:"created_at"`
}

func (q *Queries) CreateDMKeyDistribution(ctx context.Context, conversationID uuid.UUID, epoch int, userID uuid.UUID, encryptedKey []byte) (DMKeyDistribution, error) {
	var d DMKeyDistribution
	err := q.db.QueryRow(ctx,
		`INSERT INTO dm_key_distributions (conversation_id, epoch, user_id, encrypted_key)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (conversation_id, epoch, user_id) DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key
		RETURNING id, conversation_id, epoch, user_id, encrypted_key, created_at`,
		conversationID, epoch, userID, encryptedKey,
	).Scan(&d.ID, &d.ConversationID, &d.Epoch, &d.UserID, &d.EncryptedKey, &d.CreatedAt)
	return d, err
}

func (q *Queries) GetDMKeyDistributions(ctx context.Context, conversationID uuid.UUID, userID uuid.UUID) ([]DMKeyDistribution, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, conversation_id, epoch, user_id, encrypted_key, created_at
		FROM dm_key_distributions
		WHERE conversation_id = $1 AND user_id = $2
		ORDER BY epoch ASC`,
		conversationID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dists []DMKeyDistribution
	for rows.Next() {
		var d DMKeyDistribution
		if err := rows.Scan(&d.ID, &d.ConversationID, &d.Epoch, &d.UserID, &d.EncryptedKey, &d.CreatedAt); err != nil {
			return nil, err
		}
		dists = append(dists, d)
	}
	if dists == nil {
		dists = []DMKeyDistribution{}
	}
	return dists, rows.Err()
}

func (q *Queries) GetLatestDMKeyEpoch(ctx context.Context, conversationID uuid.UUID) (int, error) {
	var epoch int
	err := q.db.QueryRow(ctx,
		`SELECT COALESCE(MAX(epoch), 0) FROM dm_key_distributions WHERE conversation_id = $1`,
		conversationID,
	).Scan(&epoch)
	return epoch, err
}

// Encrypted flag on dm_conversations

func (q *Queries) SetDMConversationEncrypted(ctx context.Context, conversationID uuid.UUID, encrypted bool) error {
	_, err := q.db.Exec(ctx,
		`UPDATE dm_conversations SET encrypted = $2 WHERE id = $1`,
		conversationID, encrypted,
	)
	return err
}

// Message retention helpers

func (q *Queries) DeleteExpiredMessages(ctx context.Context, channelID uuid.UUID, retentionDays int, batchSize int) (int64, error) {
	tag, err := q.db.Exec(ctx,
		`DELETE FROM messages WHERE id IN (
			SELECT id FROM messages
			WHERE channel_id = $1 AND created_at < now() - ($2 || ' days')::interval
			LIMIT $3
		)`,
		channelID, retentionDays, batchSize,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (q *Queries) GetChannelsWithRetention(ctx context.Context) ([]struct {
	ChannelID     uuid.UUID
	RetentionDays int
}, error) {
	rows, err := q.db.Query(ctx,
		`SELECT c.id, COALESCE(c.message_retention_days, s.default_message_retention_days) as retention_days
		FROM channels c
		JOIN servers s ON c.server_id = s.id
		WHERE c.message_retention_days IS NOT NULL OR s.default_message_retention_days IS NOT NULL`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []struct {
		ChannelID     uuid.UUID
		RetentionDays int
	}
	for rows.Next() {
		var item struct {
			ChannelID     uuid.UUID
			RetentionDays int
		}
		if err := rows.Scan(&item.ChannelID, &item.RetentionDays); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}
