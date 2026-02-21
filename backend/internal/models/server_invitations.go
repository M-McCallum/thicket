package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type ServerInvitation struct {
	ID          uuid.UUID `json:"id"`
	ServerID    uuid.UUID `json:"server_id"`
	SenderID    uuid.UUID `json:"sender_id"`
	RecipientID uuid.UUID `json:"recipient_id"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

type ServerInvitationWithDetails struct {
	ServerInvitation
	ServerName        string  `json:"server_name"`
	ServerIconURL     *string `json:"server_icon_url"`
	SenderUsername    string  `json:"sender_username"`
	RecipientUsername string  `json:"recipient_username"`
}

func (q *Queries) CreateServerInvitation(ctx context.Context, serverID, senderID, recipientID uuid.UUID) (ServerInvitation, error) {
	var inv ServerInvitation
	err := q.db.QueryRow(ctx,
		`INSERT INTO server_invitations (server_id, sender_id, recipient_id)
		VALUES ($1, $2, $3)
		RETURNING id, server_id, sender_id, recipient_id, status, created_at`,
		serverID, senderID, recipientID,
	).Scan(&inv.ID, &inv.ServerID, &inv.SenderID, &inv.RecipientID, &inv.Status, &inv.CreatedAt)
	return inv, err
}

func (q *Queries) FindPendingServerInvitation(ctx context.Context, serverID, senderID, recipientID uuid.UUID) (ServerInvitation, error) {
	var inv ServerInvitation
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, sender_id, recipient_id, status, created_at
		FROM server_invitations
		WHERE server_id = $1 AND sender_id = $2 AND recipient_id = $3 AND status = 'pending'`,
		serverID, senderID, recipientID,
	).Scan(&inv.ID, &inv.ServerID, &inv.SenderID, &inv.RecipientID, &inv.Status, &inv.CreatedAt)
	return inv, err
}

func (q *Queries) GetServerInvitationByID(ctx context.Context, id uuid.UUID) (ServerInvitation, error) {
	var inv ServerInvitation
	err := q.db.QueryRow(ctx,
		`SELECT id, server_id, sender_id, recipient_id, status, created_at
		FROM server_invitations WHERE id = $1`, id,
	).Scan(&inv.ID, &inv.ServerID, &inv.SenderID, &inv.RecipientID, &inv.Status, &inv.CreatedAt)
	return inv, err
}

func (q *Queries) UpdateServerInvitationStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE server_invitations SET status = $2 WHERE id = $1`, id, status,
	)
	return err
}

func (q *Queries) GetPendingInvitationsForUser(ctx context.Context, recipientID uuid.UUID) ([]ServerInvitationWithDetails, error) {
	rows, err := q.db.Query(ctx,
		`SELECT si.id, si.server_id, si.sender_id, si.recipient_id, si.status, si.created_at,
			s.name, s.icon_url, u1.username, u2.username
		FROM server_invitations si
		JOIN servers s ON s.id = si.server_id
		JOIN users u1 ON u1.id = si.sender_id
		JOIN users u2 ON u2.id = si.recipient_id
		WHERE si.recipient_id = $1 AND si.status = 'pending'
		ORDER BY si.created_at DESC`,
		recipientID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []ServerInvitationWithDetails
	for rows.Next() {
		var inv ServerInvitationWithDetails
		if err := rows.Scan(
			&inv.ID, &inv.ServerID, &inv.SenderID, &inv.RecipientID, &inv.Status, &inv.CreatedAt,
			&inv.ServerName, &inv.ServerIconURL, &inv.SenderUsername, &inv.RecipientUsername,
		); err != nil {
			return nil, err
		}
		invitations = append(invitations, inv)
	}
	if invitations == nil {
		invitations = []ServerInvitationWithDetails{}
	}
	return invitations, rows.Err()
}

func (q *Queries) GetSentInvitationsForServer(ctx context.Context, senderID, serverID uuid.UUID) ([]ServerInvitationWithDetails, error) {
	rows, err := q.db.Query(ctx,
		`SELECT si.id, si.server_id, si.sender_id, si.recipient_id, si.status, si.created_at,
			s.name, s.icon_url, u1.username, u2.username
		FROM server_invitations si
		JOIN servers s ON s.id = si.server_id
		JOIN users u1 ON u1.id = si.sender_id
		JOIN users u2 ON u2.id = si.recipient_id
		WHERE si.sender_id = $1 AND si.server_id = $2 AND si.status = 'pending'
		ORDER BY si.created_at DESC`,
		senderID, serverID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []ServerInvitationWithDetails
	for rows.Next() {
		var inv ServerInvitationWithDetails
		if err := rows.Scan(
			&inv.ID, &inv.ServerID, &inv.SenderID, &inv.RecipientID, &inv.Status, &inv.CreatedAt,
			&inv.ServerName, &inv.ServerIconURL, &inv.SenderUsername, &inv.RecipientUsername,
		); err != nil {
			return nil, err
		}
		invitations = append(invitations, inv)
	}
	if invitations == nil {
		invitations = []ServerInvitationWithDetails{}
	}
	return invitations, rows.Err()
}
