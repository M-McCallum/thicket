package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
)

type ReadStateService struct {
	queries *models.Queries
}

func NewReadStateService(q *models.Queries) *ReadStateService {
	return &ReadStateService{queries: q}
}

func (s *ReadStateService) AckChannel(ctx context.Context, userID, channelID uuid.UUID) error {
	if err := s.queries.UpsertChannelReadState(ctx, userID, channelID); err != nil {
		return err
	}
	return s.queries.MarkMentionsSeen(ctx, userID, channelID)
}

func (s *ReadStateService) AckDM(ctx context.Context, userID, conversationID uuid.UUID) error {
	return s.queries.UpsertDMReadState(ctx, userID, conversationID)
}

func (s *ReadStateService) GetUnreadCounts(ctx context.Context, userID uuid.UUID) ([]models.UnreadCount, error) {
	return s.queries.GetChannelUnreadCounts(ctx, userID)
}

func (s *ReadStateService) GetDMUnreadCounts(ctx context.Context, userID uuid.UUID) ([]models.DMUnreadCount, error) {
	return s.queries.GetDMUnreadCounts(ctx, userID)
}
