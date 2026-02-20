package models

import (
	"context"

	"github.com/google/uuid"
)

func (q *Queries) CreateFriendship(ctx context.Context, requesterID, addresseeID uuid.UUID) (Friendship, error) {
	var f Friendship
	err := q.db.QueryRow(ctx,
		`INSERT INTO friendships (requester_id, addressee_id, status)
		VALUES ($1, $2, 'pending')
		RETURNING id, requester_id, addressee_id, status, created_at, updated_at`,
		requesterID, addresseeID,
	).Scan(&f.ID, &f.RequesterID, &f.AddresseeID, &f.Status, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (q *Queries) GetFriendshipByID(ctx context.Context, id uuid.UUID) (Friendship, error) {
	var f Friendship
	err := q.db.QueryRow(ctx,
		`SELECT id, requester_id, addressee_id, status, created_at, updated_at
		FROM friendships WHERE id = $1`, id,
	).Scan(&f.ID, &f.RequesterID, &f.AddresseeID, &f.Status, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (q *Queries) GetFriendshipBetween(ctx context.Context, userA, userB uuid.UUID) (Friendship, error) {
	var f Friendship
	err := q.db.QueryRow(ctx,
		`SELECT id, requester_id, addressee_id, status, created_at, updated_at
		FROM friendships
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)`, userA, userB,
	).Scan(&f.ID, &f.RequesterID, &f.AddresseeID, &f.Status, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (q *Queries) UpdateFriendshipStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := q.db.Exec(ctx,
		`UPDATE friendships SET status = $2, updated_at = NOW() WHERE id = $1`,
		id, status,
	)
	return err
}

func (q *Queries) DeleteFriendship(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM friendships WHERE id = $1`, id)
	return err
}

func (q *Queries) GetAcceptedFriends(ctx context.Context, userID uuid.UUID) ([]FriendshipWithUser, error) {
	rows, err := q.db.Query(ctx,
		`SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at, f.updated_at,
		        u.username, u.display_name, u.avatar_url, u.status
		FROM friendships f
		JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
		WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
		ORDER BY u.username`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var friends []FriendshipWithUser
	for rows.Next() {
		var f FriendshipWithUser
		if err := rows.Scan(&f.ID, &f.RequesterID, &f.AddresseeID, &f.Status, &f.CreatedAt, &f.UpdatedAt,
			&f.Username, &f.DisplayName, &f.AvatarURL, &f.UserStatus); err != nil {
			return nil, err
		}
		friends = append(friends, f)
	}
	if friends == nil {
		friends = []FriendshipWithUser{}
	}
	return friends, rows.Err()
}

func (q *Queries) GetPendingFriendRequests(ctx context.Context, userID uuid.UUID) ([]FriendshipWithUser, error) {
	rows, err := q.db.Query(ctx,
		`SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at, f.updated_at,
		        u.username, u.display_name, u.avatar_url, u.status
		FROM friendships f
		JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
		WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'pending'
		ORDER BY f.created_at DESC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []FriendshipWithUser
	for rows.Next() {
		var f FriendshipWithUser
		if err := rows.Scan(&f.ID, &f.RequesterID, &f.AddresseeID, &f.Status, &f.CreatedAt, &f.UpdatedAt,
			&f.Username, &f.DisplayName, &f.AvatarURL, &f.UserStatus); err != nil {
			return nil, err
		}
		requests = append(requests, f)
	}
	if requests == nil {
		requests = []FriendshipWithUser{}
	}
	return requests, rows.Err()
}

func (q *Queries) GetServerMemberCount(ctx context.Context, serverID uuid.UUID) (int64, error) {
	var count int64
	err := q.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM server_members WHERE server_id = $1`, serverID,
	).Scan(&count)
	return count, err
}

func (q *Queries) AreFriendsOrCoMembers(ctx context.Context, userA, userB uuid.UUID) (bool, error) {
	var exists bool
	err := q.db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM friendships
			WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
			  AND status = 'accepted'
		) OR EXISTS(
			SELECT 1 FROM server_members sm1
			JOIN server_members sm2 ON sm1.server_id = sm2.server_id
			WHERE sm1.user_id = $1 AND sm2.user_id = $2
		)`, userA, userB,
	).Scan(&exists)
	return exists, err
}
