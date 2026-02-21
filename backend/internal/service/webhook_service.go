package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrWebhookNotFound     = errors.New("webhook not found")
	ErrWebhookTokenInvalid = errors.New("invalid webhook token")
	ErrInvalidWebhookName  = errors.New("webhook name must be 1-80 characters")
)

type WebhookService struct {
	queries *models.Queries
	permSvc *PermissionService
}

func NewWebhookService(q *models.Queries, permSvc *PermissionService) *WebhookService {
	return &WebhookService{queries: q, permSvc: permSvc}
}

// CreateWebhook creates a webhook for a channel. The caller must have ManageChannels.
// Returns the webhook with the plaintext token (shown once).
func (s *WebhookService) CreateWebhook(ctx context.Context, channelID, creatorID uuid.UUID, name string) (*models.Webhook, string, error) {
	if len(name) < 1 || len(name) > 80 {
		return nil, "", ErrInvalidWebhookName
	}

	// Verify channel exists and get server ID for permission check
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", ErrChannelNotFound
		}
		return nil, "", err
	}

	// Check membership
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, creatorID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", ErrNotMember
		}
		return nil, "", err
	}

	// Check permission
	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, creatorID, models.PermManageChannels)
	if err != nil {
		return nil, "", err
	}
	if !ok {
		return nil, "", ErrInsufficientRole
	}

	token, err := GenerateToken()
	if err != nil {
		return nil, "", err
	}

	tokenHash, err := HashToken(token)
	if err != nil {
		return nil, "", err
	}

	webhook, err := s.queries.CreateWebhook(ctx, models.CreateWebhookParams{
		ChannelID: channelID,
		Name:      name,
		Token:     tokenHash,
		CreatorID: creatorID,
	})
	if err != nil {
		return nil, "", err
	}

	return &webhook, token, nil
}

// ListWebhooks lists all webhooks for a channel.
func (s *WebhookService) ListWebhooks(ctx context.Context, channelID, userID uuid.UUID) ([]models.Webhook, error) {
	// Verify channel exists and user is a member
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrChannelNotFound
		}
		return nil, err
	}

	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	return s.queries.GetWebhooksByChannel(ctx, channelID)
}

// DeleteWebhook deletes a webhook. The caller must have ManageChannels permission.
func (s *WebhookService) DeleteWebhook(ctx context.Context, webhookID, userID uuid.UUID) error {
	webhook, err := s.queries.GetWebhookByID(ctx, webhookID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrWebhookNotFound
		}
		return err
	}

	channel, err := s.queries.GetChannelByID(ctx, webhook.ChannelID)
	if err != nil {
		return err
	}

	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	return s.queries.DeleteWebhook(ctx, webhookID)
}

// ExecuteWebhook validates the webhook token and creates a message in the channel.
// Returns the created message.
func (s *WebhookService) ExecuteWebhook(ctx context.Context, webhookID uuid.UUID, token string, content string) (*models.Webhook, *models.Message, error) {
	webhook, err := s.queries.GetWebhookByID(ctx, webhookID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrWebhookNotFound
		}
		return nil, nil, err
	}

	if !ValidateToken(token, webhook.TokenHash) {
		return nil, nil, ErrWebhookTokenInvalid
	}

	if content == "" {
		return nil, nil, ErrEmptyMessage
	}

	// Create message with the webhook's creator as the author
	msg, err := s.queries.CreateMessage(ctx, models.CreateMessageParams{
		ChannelID: webhook.ChannelID,
		AuthorID:  webhook.CreatorID,
		Content:   content,
		Type:      "text",
	})
	if err != nil {
		return nil, nil, err
	}

	return &webhook, &msg, nil
}

// GetWebhookForExecution returns a webhook by ID (used for public execute endpoint).
func (s *WebhookService) GetWebhookForExecution(ctx context.Context, webhookID uuid.UUID) (*models.Webhook, error) {
	webhook, err := s.queries.GetWebhookByID(ctx, webhookID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWebhookNotFound
		}
		return nil, err
	}
	return &webhook, nil
}
