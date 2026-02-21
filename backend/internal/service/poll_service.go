package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrPollNotFound       = errors.New("poll not found")
	ErrPollExpired        = errors.New("poll has expired")
	ErrInvalidQuestion    = errors.New("poll question must be 1-300 characters")
	ErrTooFewOptions      = errors.New("poll must have at least 2 options")
	ErrTooManyOptions     = errors.New("poll must have at most 10 options")
	ErrOptionNotFound     = errors.New("poll option not found")
	ErrSingleSelectActive = errors.New("single-select poll: remove existing vote first")
)

type PollOptionInput struct {
	Text  string `json:"text"`
	Emoji string `json:"emoji"`
}

type PollService struct {
	queries *models.Queries
}

func NewPollService(q *models.Queries) *PollService {
	return &PollService{queries: q}
}

func (s *PollService) CreatePoll(ctx context.Context, channelID uuid.UUID, authorID uuid.UUID, question string, options []PollOptionInput, multiSelect, anonymous bool, expiresAt *time.Time) (*models.PollWithOptions, error) {
	if len(question) < 1 || len(question) > 300 {
		return nil, ErrInvalidQuestion
	}
	if len(options) < 2 {
		return nil, ErrTooFewOptions
	}
	if len(options) > 10 {
		return nil, ErrTooManyOptions
	}

	// Create a message with type "poll" to hold the poll
	msg, err := s.queries.CreateMessage(ctx, models.CreateMessageParams{
		ChannelID: channelID,
		AuthorID:  authorID,
		Content:   question,
		Type:      "poll",
	})
	if err != nil {
		return nil, err
	}

	poll, err := s.queries.CreatePoll(ctx, models.CreatePollParams{
		MessageID:   &msg.ID,
		Question:    question,
		MultiSelect: multiSelect,
		Anonymous:   anonymous,
		ExpiresAt:   expiresAt,
	})
	if err != nil {
		return nil, err
	}

	var pollOptions []models.PollOptionWithVotes
	for i, opt := range options {
		o, err := s.queries.CreatePollOption(ctx, poll.ID, opt.Text, opt.Emoji, i)
		if err != nil {
			return nil, err
		}
		pollOptions = append(pollOptions, models.PollOptionWithVotes{
			PollOption: o,
			VoteCount:  0,
			Voted:      false,
		})
	}

	return &models.PollWithOptions{
		Poll:       poll,
		Options:    pollOptions,
		TotalVotes: 0,
	}, nil
}

func (s *PollService) GetPoll(ctx context.Context, pollID, userID uuid.UUID) (*models.PollWithOptions, error) {
	poll, err := s.queries.GetPollByID(ctx, pollID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPollNotFound
		}
		return nil, err
	}

	options, err := s.queries.GetPollOptionsWithVotes(ctx, pollID, userID)
	if err != nil {
		return nil, err
	}

	totalVotes, err := s.queries.GetTotalPollVotes(ctx, pollID)
	if err != nil {
		return nil, err
	}

	return &models.PollWithOptions{
		Poll:       poll,
		Options:    options,
		TotalVotes: totalVotes,
	}, nil
}

func (s *PollService) GetPollByMessageID(ctx context.Context, messageID, userID uuid.UUID) (*models.PollWithOptions, error) {
	poll, err := s.queries.GetPollByMessageID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPollNotFound
		}
		return nil, err
	}

	return s.GetPoll(ctx, poll.ID, userID)
}

func (s *PollService) Vote(ctx context.Context, pollID, optionID, userID uuid.UUID) error {
	poll, err := s.queries.GetPollByID(ctx, pollID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrPollNotFound
		}
		return err
	}

	if poll.ExpiresAt != nil && time.Now().After(*poll.ExpiresAt) {
		return ErrPollExpired
	}

	// Verify option belongs to poll
	options, err := s.queries.GetPollOptions(ctx, pollID)
	if err != nil {
		return err
	}
	found := false
	for _, o := range options {
		if o.ID == optionID {
			found = true
			break
		}
	}
	if !found {
		return ErrOptionNotFound
	}

	// For single-select, remove existing votes first
	if !poll.MultiSelect {
		if err := s.queries.RemoveAllPollVotes(ctx, pollID, userID); err != nil {
			return err
		}
	}

	return s.queries.AddPollVote(ctx, pollID, optionID, userID)
}

func (s *PollService) RemoveVote(ctx context.Context, pollID, optionID, userID uuid.UUID) error {
	_, err := s.queries.GetPollByID(ctx, pollID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrPollNotFound
		}
		return err
	}

	return s.queries.RemovePollVote(ctx, pollID, optionID, userID)
}

// GetPollChannelID looks up the channel_id for the message associated with a poll.
func (s *PollService) GetPollChannelID(ctx context.Context, pollID uuid.UUID) string {
	poll, err := s.queries.GetPollByID(ctx, pollID)
	if err != nil || poll.MessageID == nil {
		return ""
	}
	msg, err := s.queries.GetMessageByID(ctx, *poll.MessageID)
	if err != nil {
		return ""
	}
	return msg.ChannelID.String()
}
