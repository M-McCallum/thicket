package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ServerEvent represents a scheduled server event.
type ServerEvent struct {
	ID               uuid.UUID  `json:"id"`
	ServerID         uuid.UUID  `json:"server_id"`
	CreatorID        uuid.UUID  `json:"creator_id"`
	Name             string     `json:"name"`
	Description      string     `json:"description"`
	LocationType     string     `json:"location_type"`
	ChannelID        *uuid.UUID `json:"channel_id"`
	ExternalLocation string     `json:"external_location"`
	StartTime        time.Time  `json:"start_time"`
	EndTime          *time.Time `json:"end_time"`
	ImageURL         *string    `json:"image_url"`
	Status           string     `json:"status"`
	CreatedAt        time.Time  `json:"created_at"`
}

// ServerEventWithRSVP extends ServerEvent with RSVP counts and the current user's RSVP.
type ServerEventWithRSVP struct {
	ServerEvent
	InterestedCount int     `json:"interested_count"`
	UserRSVP        *string `json:"user_rsvp"`
	CreatorUsername  string  `json:"creator_username"`
}

// EventRSVP represents a user's RSVP to a server event.
type EventRSVP struct {
	EventID uuid.UUID `json:"event_id"`
	UserID  uuid.UUID `json:"user_id"`
	Status  string    `json:"status"`
}

// CreateEventParams holds parameters for creating a server event.
type CreateEventParams struct {
	ServerID         uuid.UUID
	CreatorID        uuid.UUID
	Name             string
	Description      string
	LocationType     string
	ChannelID        *uuid.UUID
	ExternalLocation string
	StartTime        time.Time
	EndTime          *time.Time
	ImageURL         *string
}

func (q *Queries) CreateEvent(ctx context.Context, arg CreateEventParams) (ServerEvent, error) {
	var e ServerEvent
	err := q.db.QueryRow(ctx,
		`INSERT INTO server_events (server_id, creator_id, name, description, location_type, channel_id, external_location, start_time, end_time, image_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, server_id, creator_id, name, description, location_type, channel_id, external_location, start_time, end_time, image_url, status, created_at`,
		arg.ServerID, arg.CreatorID, arg.Name, arg.Description, arg.LocationType, arg.ChannelID, arg.ExternalLocation, arg.StartTime, arg.EndTime, arg.ImageURL,
	).Scan(&e.ID, &e.ServerID, &e.CreatorID, &e.Name, &e.Description, &e.LocationType, &e.ChannelID, &e.ExternalLocation, &e.StartTime, &e.EndTime, &e.ImageURL, &e.Status, &e.CreatedAt)
	return e, err
}

func (q *Queries) GetEventByID(ctx context.Context, eventID uuid.UUID) (ServerEvent, error) {
	var e ServerEvent
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, creator_id, name, description, location_type, channel_id, external_location, start_time, end_time, image_url, status, created_at
		FROM server_events WHERE id = $1`, eventID,
	).Scan(&e.ID, &e.ServerID, &e.CreatorID, &e.Name, &e.Description, &e.LocationType, &e.ChannelID, &e.ExternalLocation, &e.StartTime, &e.EndTime, &e.ImageURL, &e.Status, &e.CreatedAt)
	return e, err
}

func (q *Queries) GetServerEvents(ctx context.Context, serverID, userID uuid.UUID) ([]ServerEventWithRSVP, error) {
	rows, err := q.db.Query(ctx,
		`SELECT e.id, e.server_id, e.creator_id, e.name, e.description, e.location_type, e.channel_id,
			e.external_location, e.start_time, e.end_time, e.image_url, e.status, e.created_at,
			COALESCE((SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id), 0) AS interested_count,
			(SELECT status FROM event_rsvps WHERE event_id = e.id AND user_id = $2) AS user_rsvp,
			u.username AS creator_username
		FROM server_events e
		JOIN users u ON e.creator_id = u.id
		WHERE e.server_id = $1
		ORDER BY e.start_time ASC`, serverID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []ServerEventWithRSVP
	for rows.Next() {
		var ev ServerEventWithRSVP
		if err := rows.Scan(
			&ev.ID, &ev.ServerID, &ev.CreatorID, &ev.Name, &ev.Description, &ev.LocationType, &ev.ChannelID,
			&ev.ExternalLocation, &ev.StartTime, &ev.EndTime, &ev.ImageURL, &ev.Status, &ev.CreatedAt,
			&ev.InterestedCount, &ev.UserRSVP, &ev.CreatorUsername,
		); err != nil {
			return nil, err
		}
		events = append(events, ev)
	}
	if events == nil {
		events = []ServerEventWithRSVP{}
	}
	return events, rows.Err()
}

func (q *Queries) GetEventWithRSVP(ctx context.Context, eventID, userID uuid.UUID) (ServerEventWithRSVP, error) {
	var ev ServerEventWithRSVP
	err := q.db.QueryRow(ctx,
		`SELECT e.id, e.server_id, e.creator_id, e.name, e.description, e.location_type, e.channel_id,
			e.external_location, e.start_time, e.end_time, e.image_url, e.status, e.created_at,
			COALESCE((SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id), 0) AS interested_count,
			(SELECT status FROM event_rsvps WHERE event_id = e.id AND user_id = $2) AS user_rsvp,
			u.username AS creator_username
		FROM server_events e
		JOIN users u ON e.creator_id = u.id
		WHERE e.id = $1`, eventID, userID,
	).Scan(
		&ev.ID, &ev.ServerID, &ev.CreatorID, &ev.Name, &ev.Description, &ev.LocationType, &ev.ChannelID,
		&ev.ExternalLocation, &ev.StartTime, &ev.EndTime, &ev.ImageURL, &ev.Status, &ev.CreatedAt,
		&ev.InterestedCount, &ev.UserRSVP, &ev.CreatorUsername,
	)
	return ev, err
}

type UpdateEventParams struct {
	ID               uuid.UUID
	Name             *string
	Description      *string
	LocationType     *string
	ChannelID        *uuid.UUID
	ExternalLocation *string
	StartTime        *time.Time
	EndTime          *time.Time
	Status           *string
}

func (q *Queries) UpdateEvent(ctx context.Context, arg UpdateEventParams) (ServerEvent, error) {
	var e ServerEvent
	err := q.db.QueryRow(ctx,
		`UPDATE server_events SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			location_type = COALESCE($4, location_type),
			channel_id = COALESCE($5, channel_id),
			external_location = COALESCE($6, external_location),
			start_time = COALESCE($7, start_time),
			end_time = COALESCE($8, end_time),
			status = COALESCE($9, status)
		WHERE id = $1
		RETURNING id, server_id, creator_id, name, description, location_type, channel_id, external_location, start_time, end_time, image_url, status, created_at`,
		arg.ID, arg.Name, arg.Description, arg.LocationType, arg.ChannelID, arg.ExternalLocation, arg.StartTime, arg.EndTime, arg.Status,
	).Scan(&e.ID, &e.ServerID, &e.CreatorID, &e.Name, &e.Description, &e.LocationType, &e.ChannelID, &e.ExternalLocation, &e.StartTime, &e.EndTime, &e.ImageURL, &e.Status, &e.CreatedAt)
	return e, err
}

func (q *Queries) DeleteEvent(ctx context.Context, eventID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM server_events WHERE id = $1`, eventID)
	return err
}

// RSVP operations

func (q *Queries) UpsertEventRSVP(ctx context.Context, eventID, userID uuid.UUID, status string) error {
	_, err := q.db.Exec(ctx,
		`INSERT INTO event_rsvps (event_id, user_id, status)
		VALUES ($1, $2, $3)
		ON CONFLICT (event_id, user_id) DO UPDATE SET status = $3`,
		eventID, userID, status,
	)
	return err
}

func (q *Queries) DeleteEventRSVP(ctx context.Context, eventID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, eventID, userID)
	return err
}

func (q *Queries) GetEventRSVPs(ctx context.Context, eventID uuid.UUID) ([]EventRSVP, error) {
	rows, err := q.db.Query(ctx,
		`SELECT event_id, user_id, status FROM event_rsvps WHERE event_id = $1`, eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rsvps []EventRSVP
	for rows.Next() {
		var r EventRSVP
		if err := rows.Scan(&r.EventID, &r.UserID, &r.Status); err != nil {
			return nil, err
		}
		rsvps = append(rsvps, r)
	}
	if rsvps == nil {
		rsvps = []EventRSVP{}
	}
	return rsvps, rows.Err()
}

// scanEvent is unused but kept for consistency with the pattern.
var _ = scanEvent

func scanEvent(row pgx.Row) (ServerEvent, error) {
	var e ServerEvent
	err := row.Scan(&e.ID, &e.ServerID, &e.CreatorID, &e.Name, &e.Description, &e.LocationType, &e.ChannelID, &e.ExternalLocation, &e.StartTime, &e.EndTime, &e.ImageURL, &e.Status, &e.CreatedAt)
	return e, err
}
