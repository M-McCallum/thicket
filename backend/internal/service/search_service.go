package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
)

type SearchService struct {
	queries *models.Queries
}

func NewSearchService(q *models.Queries) *SearchService {
	return &SearchService{queries: q}
}

func (s *SearchService) Queries() *models.Queries {
	return s.queries
}

func (s *SearchService) SearchMessages(ctx context.Context, userID uuid.UUID, query string, channelID, serverID *uuid.UUID, before *string, limit int32, filters models.SearchFilters) ([]models.MessageWithAuthor, error) {
	if limit <= 0 || limit > 50 {
		limit = 25
	}

	// If channel-scoped, verify membership
	if channelID != nil {
		channel, err := s.queries.GetChannelByID(ctx, *channelID)
		if err != nil {
			return nil, ErrChannelNotFound
		}
		if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
			return nil, ErrNotMember
		}
		return s.queries.SearchChannelMessages(ctx, models.SearchChannelMessagesParams{
			Query:     query,
			ChannelID: *channelID,
			Before:    before,
			Limit:     limit,
			Filters:   filters,
		})
	}

	// If server-scoped, verify membership
	if serverID != nil {
		if _, err := s.queries.GetServerMember(ctx, *serverID, userID); err != nil {
			return nil, ErrNotMember
		}
		return s.queries.SearchServerMessages(ctx, models.SearchServerMessagesParams{
			Query:    query,
			ServerID: *serverID,
			Before:   before,
			Limit:    limit,
			Filters:  filters,
		})
	}

	// No scope — search across all servers user is a member of
	return s.queries.SearchUserMessages(ctx, models.SearchUserMessagesParams{
		Query:   query,
		UserID:  userID,
		Before:  before,
		Limit:   limit,
		Filters: filters,
	})
}

func (s *SearchService) SearchDMMessages(ctx context.Context, userID uuid.UUID, query string, conversationID *uuid.UUID, before *string, limit int32) ([]models.DMMessageWithAuthor, error) {
	if limit <= 0 || limit > 50 {
		limit = 25
	}

	if conversationID != nil {
		// Verify participant
		if _, err := s.queries.GetDMParticipant(ctx, *conversationID, userID); err != nil {
			return nil, ErrNotDMParticipant
		}
		return s.queries.SearchDMConversationMessages(ctx, models.SearchDMConversationMessagesParams{
			Query:          query,
			ConversationID: *conversationID,
			Before:         before,
			Limit:          limit,
		})
	}

	// Search across all user's DM conversations
	return s.queries.SearchUserDMMessages(ctx, models.SearchUserDMMessagesParams{
		Query:  query,
		UserID: userID,
		Before: before,
		Limit:  limit,
	})
}
