package models

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ForumPost represents a forum thread/post within a forum channel.
type ForumPost struct {
	ID        uuid.UUID `json:"id"`
	ChannelID uuid.UUID `json:"channel_id"`
	AuthorID  uuid.UUID `json:"author_id"`
	Title     string    `json:"title"`
	Pinned    bool      `json:"pinned"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ForumPostWithMeta extends ForumPost with author info, tags, reply count, and last activity.
type ForumPostWithMeta struct {
	ForumPost
	AuthorUsername    string     `json:"author_username"`
	AuthorDisplayName *string   `json:"author_display_name"`
	AuthorAvatarURL  *string    `json:"author_avatar_url"`
	Tags             []ForumTag `json:"tags"`
	ReplyCount       int        `json:"reply_count"`
	LastActivityAt   time.Time  `json:"last_activity_at"`
	ContentPreview   string     `json:"content_preview"`
}

// ForumTag represents a tag that can be applied to forum posts.
type ForumTag struct {
	ID        uuid.UUID `json:"id"`
	ChannelID uuid.UUID `json:"channel_id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	Emoji     string    `json:"emoji"`
	Position  int       `json:"position"`
	Moderated bool      `json:"moderated"`
	CreatedAt time.Time `json:"created_at"`
}

// ForumPostMessage represents a message/reply within a forum post.
type ForumPostMessage struct {
	ID        uuid.UUID `json:"id"`
	PostID    uuid.UUID `json:"post_id"`
	AuthorID  uuid.UUID `json:"author_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ForumPostMessageWithAuthor extends ForumPostMessage with author info.
type ForumPostMessageWithAuthor struct {
	ForumPostMessage
	AuthorUsername    string  `json:"author_username"`
	AuthorDisplayName *string `json:"author_display_name"`
	AuthorAvatarURL  *string  `json:"author_avatar_url"`
}

// --- Tag CRUD ---

type CreateForumTagParams struct {
	ChannelID uuid.UUID
	Name      string
	Color     string
	Emoji     string
	Position  int
	Moderated bool
}

func (q *Queries) CreateForumTag(ctx context.Context, arg CreateForumTagParams) (ForumTag, error) {
	var t ForumTag
	err := q.db.QueryRow(ctx,
		`INSERT INTO forum_tags (channel_id, name, color, emoji, position, moderated)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, channel_id, name, color, emoji, position, moderated, created_at`,
		arg.ChannelID, arg.Name, arg.Color, arg.Emoji, arg.Position, arg.Moderated,
	).Scan(&t.ID, &t.ChannelID, &t.Name, &t.Color, &t.Emoji, &t.Position, &t.Moderated, &t.CreatedAt)
	return t, err
}

func (q *Queries) GetForumTagsByChannel(ctx context.Context, channelID uuid.UUID) ([]ForumTag, error) {
	rows, err := q.db.Query(ctx,
		`SELECT id, channel_id, name, color, emoji, position, moderated, created_at
		FROM forum_tags WHERE channel_id = $1 ORDER BY position, name`, channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []ForumTag
	for rows.Next() {
		var t ForumTag
		if err := rows.Scan(&t.ID, &t.ChannelID, &t.Name, &t.Color, &t.Emoji, &t.Position, &t.Moderated, &t.CreatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	if tags == nil {
		tags = []ForumTag{}
	}
	return tags, rows.Err()
}

func (q *Queries) GetForumTagByID(ctx context.Context, id uuid.UUID) (ForumTag, error) {
	var t ForumTag
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, name, color, emoji, position, moderated, created_at
		FROM forum_tags WHERE id = $1`, id,
	).Scan(&t.ID, &t.ChannelID, &t.Name, &t.Color, &t.Emoji, &t.Position, &t.Moderated, &t.CreatedAt)
	return t, err
}

type UpdateForumTagParams struct {
	ID        uuid.UUID
	Name      *string
	Color     *string
	Emoji     *string
	Position  *int
	Moderated *bool
}

func (q *Queries) UpdateForumTag(ctx context.Context, arg UpdateForumTagParams) (ForumTag, error) {
	var t ForumTag
	err := q.db.QueryRow(ctx,
		`UPDATE forum_tags SET
			name = COALESCE($2, name),
			color = COALESCE($3, color),
			emoji = COALESCE($4, emoji),
			position = COALESCE($5, position),
			moderated = COALESCE($6, moderated)
		WHERE id = $1
		RETURNING id, channel_id, name, color, emoji, position, moderated, created_at`,
		arg.ID, arg.Name, arg.Color, arg.Emoji, arg.Position, arg.Moderated,
	).Scan(&t.ID, &t.ChannelID, &t.Name, &t.Color, &t.Emoji, &t.Position, &t.Moderated, &t.CreatedAt)
	return t, err
}

func (q *Queries) DeleteForumTag(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM forum_tags WHERE id = $1`, id)
	return err
}

// --- Forum Post CRUD ---

type CreateForumPostParams struct {
	ChannelID uuid.UUID
	AuthorID  uuid.UUID
	Title     string
}

func (q *Queries) CreateForumPost(ctx context.Context, arg CreateForumPostParams) (ForumPost, error) {
	var p ForumPost
	err := q.db.QueryRow(ctx,
		`INSERT INTO forum_posts (channel_id, author_id, title)
		VALUES ($1, $2, $3)
		RETURNING id, channel_id, author_id, title, pinned, created_at, updated_at`,
		arg.ChannelID, arg.AuthorID, arg.Title,
	).Scan(&p.ID, &p.ChannelID, &p.AuthorID, &p.Title, &p.Pinned, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (q *Queries) GetForumPostByID(ctx context.Context, id uuid.UUID) (ForumPost, error) {
	var p ForumPost
	err := q.db.QueryRow(ctx,
		`SELECT id, channel_id, author_id, title, pinned, created_at, updated_at
		FROM forum_posts WHERE id = $1`, id,
	).Scan(&p.ID, &p.ChannelID, &p.AuthorID, &p.Title, &p.Pinned, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (q *Queries) SetForumPostPinned(ctx context.Context, id uuid.UUID, pinned bool) error {
	_, err := q.db.Exec(ctx,
		`UPDATE forum_posts SET pinned = $2, updated_at = NOW() WHERE id = $1`,
		id, pinned,
	)
	return err
}

func (q *Queries) SetForumPostTags(ctx context.Context, postID uuid.UUID, tagIDs []uuid.UUID) error {
	// Delete existing tags
	if _, err := q.db.Exec(ctx, `DELETE FROM forum_post_tags WHERE post_id = $1`, postID); err != nil {
		return err
	}
	// Insert new tags
	for _, tagID := range tagIDs {
		if _, err := q.db.Exec(ctx,
			`INSERT INTO forum_post_tags (post_id, tag_id) VALUES ($1, $2)`,
			postID, tagID,
		); err != nil {
			return err
		}
	}
	return nil
}

func (q *Queries) GetForumPostTags(ctx context.Context, postID uuid.UUID) ([]ForumTag, error) {
	rows, err := q.db.Query(ctx,
		`SELECT ft.id, ft.channel_id, ft.name, ft.color, ft.emoji, ft.position, ft.moderated, ft.created_at
		FROM forum_tags ft
		JOIN forum_post_tags fpt ON ft.id = fpt.tag_id
		WHERE fpt.post_id = $1
		ORDER BY ft.position, ft.name`, postID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []ForumTag
	for rows.Next() {
		var t ForumTag
		if err := rows.Scan(&t.ID, &t.ChannelID, &t.Name, &t.Color, &t.Emoji, &t.Position, &t.Moderated, &t.CreatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	if tags == nil {
		tags = []ForumTag{}
	}
	return tags, rows.Err()
}

// GetForumPosts returns forum posts with metadata. Supports sorting and tag filtering.
// sortBy: "latest" (last activity), "newest" (creation), "top" (most replies)
func (q *Queries) GetForumPosts(ctx context.Context, channelID uuid.UUID, sortBy string, tagIDs []uuid.UUID, limit, offset int) ([]ForumPostWithMeta, error) {
	// Build query dynamically for optional tag filter
	baseQuery := `
		SELECT fp.id, fp.channel_id, fp.author_id, fp.title, fp.pinned, fp.created_at, fp.updated_at,
		       u.username, u.display_name, u.avatar_url,
		       COALESCE(mc.cnt, 0) AS reply_count,
		       COALESCE(mc.last_at, fp.created_at) AS last_activity_at,
		       COALESCE(first_msg.content, '') AS content_preview
		FROM forum_posts fp
		JOIN users u ON fp.author_id = u.id
		LEFT JOIN (
			SELECT post_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
			FROM forum_post_messages
			GROUP BY post_id
		) mc ON mc.post_id = fp.id
		LEFT JOIN LATERAL (
			SELECT content FROM forum_post_messages WHERE post_id = fp.id ORDER BY created_at ASC LIMIT 1
		) first_msg ON true
		WHERE fp.channel_id = $1`

	args := []any{channelID}
	argIdx := 2

	if len(tagIDs) > 0 {
		baseQuery += ` AND fp.id IN (
			SELECT post_id FROM forum_post_tags WHERE tag_id = ANY($` + itoa(argIdx) + `)
		)`
		args = append(args, tagIDs)
		argIdx++
	}

	// Pinned posts always first, then sort
	orderClause := " ORDER BY fp.pinned DESC, "
	switch sortBy {
	case "newest":
		orderClause += "fp.created_at DESC"
	case "top":
		orderClause += "reply_count DESC, fp.created_at DESC"
	default: // "latest"
		orderClause += "last_activity_at DESC"
	}

	baseQuery += orderClause
	baseQuery += " LIMIT $" + itoa(argIdx) + " OFFSET $" + itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := q.db.Query(ctx, baseQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []ForumPostWithMeta
	for rows.Next() {
		var p ForumPostWithMeta
		if err := rows.Scan(
			&p.ID, &p.ChannelID, &p.AuthorID, &p.Title, &p.Pinned, &p.CreatedAt, &p.UpdatedAt,
			&p.AuthorUsername, &p.AuthorDisplayName, &p.AuthorAvatarURL,
			&p.ReplyCount, &p.LastActivityAt, &p.ContentPreview,
		); err != nil {
			return nil, err
		}
		p.Tags = []ForumTag{} // filled below
		posts = append(posts, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if posts == nil {
		posts = []ForumPostWithMeta{}
	}

	// Batch load tags for all posts
	for i := range posts {
		tags, err := q.GetForumPostTags(ctx, posts[i].ID)
		if err != nil {
			return nil, err
		}
		posts[i].Tags = tags
	}

	return posts, nil
}

// --- Forum Post Messages ---

type CreateForumPostMessageParams struct {
	PostID   uuid.UUID
	AuthorID uuid.UUID
	Content  string
}

func (q *Queries) CreateForumPostMessage(ctx context.Context, arg CreateForumPostMessageParams) (ForumPostMessage, error) {
	var m ForumPostMessage
	err := q.db.QueryRow(ctx,
		`INSERT INTO forum_post_messages (post_id, author_id, content)
		VALUES ($1, $2, $3)
		RETURNING id, post_id, author_id, content, created_at, updated_at`,
		arg.PostID, arg.AuthorID, arg.Content,
	).Scan(&m.ID, &m.PostID, &m.AuthorID, &m.Content, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (q *Queries) GetForumPostMessages(ctx context.Context, postID uuid.UUID, limit, offset int) ([]ForumPostMessageWithAuthor, error) {
	rows, err := q.db.Query(ctx,
		`SELECT m.id, m.post_id, m.author_id, m.content, m.created_at, m.updated_at,
		        u.username, u.display_name, u.avatar_url
		FROM forum_post_messages m
		JOIN users u ON m.author_id = u.id
		WHERE m.post_id = $1
		ORDER BY m.created_at ASC
		LIMIT $2 OFFSET $3`,
		postID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ForumPostMessageWithAuthor
	for rows.Next() {
		var m ForumPostMessageWithAuthor
		if err := rows.Scan(
			&m.ID, &m.PostID, &m.AuthorID, &m.Content, &m.CreatedAt, &m.UpdatedAt,
			&m.AuthorUsername, &m.AuthorDisplayName, &m.AuthorAvatarURL,
		); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []ForumPostMessageWithAuthor{}
	}
	return messages, rows.Err()
}

// TouchForumPostUpdatedAt bumps the updated_at timestamp on a forum post.
func (q *Queries) TouchForumPostUpdatedAt(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE forum_posts SET updated_at = NOW() WHERE id = $1`, id)
	return err
}

// helper: int to string without importing strconv in a models file
func itoa(i int) string {
	if i < 10 {
		return string(rune('0' + i))
	}
	return itoa(i/10) + string(rune('0'+i%10))
}
