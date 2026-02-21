package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Poll represents a poll attached to a message.
type Poll struct {
	ID          uuid.UUID  `json:"id"`
	MessageID   *uuid.UUID `json:"message_id"`
	Question    string     `json:"question"`
	MultiSelect bool       `json:"multi_select"`
	Anonymous   bool       `json:"anonymous"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// PollOption represents a single option in a poll.
type PollOption struct {
	ID       uuid.UUID `json:"id"`
	PollID   uuid.UUID `json:"poll_id"`
	Text     string    `json:"text"`
	Emoji    string    `json:"emoji"`
	Position int       `json:"position"`
}

// PollVote represents a user's vote on a poll option.
type PollVote struct {
	PollID   uuid.UUID `json:"poll_id"`
	OptionID uuid.UUID `json:"option_id"`
	UserID   uuid.UUID `json:"user_id"`
}

// PollOptionWithVotes extends PollOption with vote count and whether the current user voted.
type PollOptionWithVotes struct {
	PollOption
	VoteCount int  `json:"vote_count"`
	Voted     bool `json:"voted"`
}

// PollWithOptions is a poll with all its options and vote information.
type PollWithOptions struct {
	Poll
	Options    []PollOptionWithVotes `json:"options"`
	TotalVotes int                   `json:"total_votes"`
}

// CreatePollParams holds parameters for creating a poll.
type CreatePollParams struct {
	MessageID   *uuid.UUID
	Question    string
	MultiSelect bool
	Anonymous   bool
	ExpiresAt   *time.Time
}

func (q *Queries) CreatePoll(ctx context.Context, arg CreatePollParams) (Poll, error) {
	var p Poll
	err := q.db.QueryRow(ctx,
		`INSERT INTO polls (message_id, question, multi_select, anonymous, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, message_id, question, multi_select, anonymous, expires_at, created_at`,
		arg.MessageID, arg.Question, arg.MultiSelect, arg.Anonymous, arg.ExpiresAt,
	).Scan(&p.ID, &p.MessageID, &p.Question, &p.MultiSelect, &p.Anonymous, &p.ExpiresAt, &p.CreatedAt)
	return p, err
}

func (q *Queries) CreatePollOption(ctx context.Context, pollID uuid.UUID, text, emoji string, position int) (PollOption, error) {
	var o PollOption
	err := q.db.QueryRow(ctx,
		`INSERT INTO poll_options (poll_id, text, emoji, position)
		VALUES ($1, $2, $3, $4)
		RETURNING id, poll_id, text, emoji, position`,
		pollID, text, emoji, position,
	).Scan(&o.ID, &o.PollID, &o.Text, &o.Emoji, &o.Position)
	return o, err
}

func (q *Queries) GetPollByID(ctx context.Context, pollID uuid.UUID) (Poll, error) {
	var p Poll
	err := q.db.QueryRow(ctx,
		`SELECT id, message_id, question, multi_select, anonymous, expires_at, created_at
		FROM polls WHERE id = $1`, pollID,
	).Scan(&p.ID, &p.MessageID, &p.Question, &p.MultiSelect, &p.Anonymous, &p.ExpiresAt, &p.CreatedAt)
	return p, err
}

func (q *Queries) GetPollByMessageID(ctx context.Context, messageID uuid.UUID) (Poll, error) {
	var p Poll
	err := q.db.QueryRow(ctx,
		`SELECT id, message_id, question, multi_select, anonymous, expires_at, created_at
		FROM polls WHERE message_id = $1`, messageID,
	).Scan(&p.ID, &p.MessageID, &p.Question, &p.MultiSelect, &p.Anonymous, &p.ExpiresAt, &p.CreatedAt)
	return p, err
}

func (q *Queries) GetPollOptions(ctx context.Context, pollID uuid.UUID) ([]PollOption, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, poll_id, text, emoji, position
		FROM poll_options WHERE poll_id = $1 ORDER BY position ASC`, pollID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var options []PollOption
	for rows.Next() {
		var o PollOption
		if err := rows.Scan(&o.ID, &o.PollID, &o.Text, &o.Emoji, &o.Position); err != nil {
			return nil, err
		}
		options = append(options, o)
	}
	if options == nil {
		options = []PollOption{}
	}
	return options, rows.Err()
}

func (q *Queries) GetPollOptionsWithVotes(ctx context.Context, pollID, userID uuid.UUID) ([]PollOptionWithVotes, error) {
	rows, err := q.db.Query(ctx,
		`SELECT o.id, o.poll_id, o.text, o.emoji, o.position,
			COALESCE((SELECT COUNT(*) FROM poll_votes WHERE option_id = o.id), 0) AS vote_count,
			EXISTS(SELECT 1 FROM poll_votes WHERE option_id = o.id AND user_id = $2) AS voted
		FROM poll_options o
		WHERE o.poll_id = $1
		ORDER BY o.position ASC`, pollID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var options []PollOptionWithVotes
	for rows.Next() {
		var o PollOptionWithVotes
		if err := rows.Scan(&o.ID, &o.PollID, &o.Text, &o.Emoji, &o.Position, &o.VoteCount, &o.Voted); err != nil {
			return nil, err
		}
		options = append(options, o)
	}
	if options == nil {
		options = []PollOptionWithVotes{}
	}
	return options, rows.Err()
}

func (q *Queries) AddPollVote(ctx context.Context, pollID, optionID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO poll_votes (poll_id, option_id, user_id)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`,
		pollID, optionID, userID,
	)
	return err
}

func (q *Queries) RemovePollVote(ctx context.Context, pollID, optionID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM poll_votes WHERE poll_id = $1 AND option_id = $2 AND user_id = $3`,
		pollID, optionID, userID,
	)
	return err
}

func (q *Queries) RemoveAllPollVotes(ctx context.Context, pollID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`,
		pollID, userID,
	)
	return err
}

func (q *Queries) GetTotalPollVotes(ctx context.Context, pollID uuid.UUID) (int, error) {
	var count int
	err := q.db.QueryRow(ctx,
		`SELECT COUNT(DISTINCT user_id) FROM poll_votes WHERE poll_id = $1`, pollID,
	).Scan(&count)
	return count, err
}

func (q *Queries) DeletePoll(ctx context.Context, pollID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM polls WHERE id = $1`, pollID)
	return err
}
