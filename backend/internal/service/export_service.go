package service

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/M-McCallum/thicket/internal/models"
)

type ExportService struct {
	queries *models.Queries
}

func NewExportService(q *models.Queries) *ExportService {
	return &ExportService{queries: q}
}

// ExportMessage is the JSON representation of a message in an export.
type ExportMessage struct {
	ID          uuid.UUID        `json:"id"`
	AuthorID    uuid.UUID        `json:"author_id"`
	Author      string           `json:"author"`
	Content     string           `json:"content"`
	Type        string           `json:"type"`
	Timestamp   time.Time        `json:"timestamp"`
	Attachments []ExportAttachment `json:"attachments,omitempty"`
}

type ExportAttachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

// ExportChannelMessages fetches all messages from a channel and returns them
// in the requested format (json or html). Verifies user membership first.
func (s *ExportService) ExportChannelMessages(ctx context.Context, channelID, userID uuid.UUID, format string) ([]byte, string, error) {
	// Verify channel exists and user is a member
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, "", ErrChannelNotFound
		}
		return nil, "", err
	}

	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if err == pgx.ErrNoRows {
			return nil, "", ErrNotMember
		}
		return nil, "", err
	}

	// Fetch all messages (paginated internally — no limit)
	messages, err := s.getAllChannelMessages(ctx, channelID)
	if err != nil {
		return nil, "", err
	}

	// Convert to export format
	exportMsgs := make([]ExportMessage, len(messages))
	for i, m := range messages {
		em := ExportMessage{
			ID:        m.ID,
			AuthorID:  m.AuthorID,
			Author:    m.AuthorUsername,
			Content:   m.Content,
			Type:      m.Type,
			Timestamp: m.CreatedAt,
		}
		for _, a := range m.Attachments {
			em.Attachments = append(em.Attachments, ExportAttachment{
				Filename:    a.OriginalFilename,
				ContentType: a.ContentType,
				Size:        a.Size,
			})
		}
		exportMsgs[i] = em
	}

	channelName := channel.Name

	switch format {
	case "html":
		data, err := renderHTML(channelName, exportMsgs)
		return data, channelName, err
	default:
		data, err := json.MarshalIndent(exportMsgs, "", "  ")
		return data, channelName, err
	}
}

// getAllChannelMessages fetches all messages for a channel in chronological order.
func (s *ExportService) getAllChannelMessages(ctx context.Context, channelID uuid.UUID) ([]models.MessageWithAuthor, error) {
	var all []models.MessageWithAuthor
	var before *time.Time
	batchSize := int32(100)

	for {
		batch, err := s.queries.GetChannelMessages(ctx, models.GetChannelMessagesParams{
			ChannelID: channelID,
			Before:    before,
			Limit:     batchSize,
		})
		if err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}
		all = append(all, batch...)
		// GetChannelMessages returns DESC order, so last item is oldest
		oldest := batch[len(batch)-1].CreatedAt
		before = &oldest
		if len(batch) < int(batchSize) {
			break
		}
	}

	// Reverse to chronological order (ASC)
	for i, j := 0, len(all)-1; i < j; i, j = i+1, j-1 {
		all[i], all[j] = all[j], all[i]
	}

	return all, nil
}

func renderHTML(channelName string, messages []ExportMessage) ([]byte, error) {
	var b strings.Builder

	b.WriteString(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Channel Export - #`)
	b.WriteString(html.EscapeString(channelName))
	b.WriteString(`</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #002b36; color: #839496; }
h1 { color: #b58900; border-bottom: 1px solid #073642; padding-bottom: 10px; }
.msg { padding: 8px 0; border-bottom: 1px solid #073642; }
.author { font-weight: bold; color: #268bd2; }
.time { color: #586e75; font-size: 0.85em; margin-left: 8px; }
.content { margin-top: 4px; white-space: pre-wrap; }
.attachment { color: #2aa198; font-size: 0.9em; margin-top: 2px; }
.meta { color: #586e75; font-size: 0.85em; margin-top: 20px; }
</style>
</head>
<body>
<h1>#`)
	b.WriteString(html.EscapeString(channelName))
	b.WriteString("</h1>\n")

	for _, m := range messages {
		b.WriteString(`<div class="msg">`)
		b.WriteString(`<span class="author">`)
		b.WriteString(html.EscapeString(m.Author))
		b.WriteString(`</span>`)
		b.WriteString(`<span class="time">`)
		b.WriteString(m.Timestamp.Format(time.RFC3339))
		b.WriteString(`</span>`)
		b.WriteString(`<div class="content">`)
		b.WriteString(html.EscapeString(m.Content))
		b.WriteString(`</div>`)
		for _, a := range m.Attachments {
			b.WriteString(`<div class="attachment">`)
			b.WriteString(fmt.Sprintf("[Attachment: %s (%s, %d bytes)]",
				html.EscapeString(a.Filename),
				html.EscapeString(a.ContentType),
				a.Size))
			b.WriteString(`</div>`)
		}
		b.WriteString("</div>\n")
	}

	b.WriteString(fmt.Sprintf(`<div class="meta">Exported %d messages on %s</div>`,
		len(messages), time.Now().UTC().Format(time.RFC3339)))
	b.WriteString("\n</body>\n</html>")

	return []byte(b.String()), nil
}

// AccountExport is the structure returned by ExportAccountData.
type AccountExport struct {
	Profile         AccountExportProfile       `json:"profile"`
	Servers         []AccountExportServer       `json:"servers"`
	DMConversations []AccountExportConversation `json:"dm_conversations"`
	ExportedAt      time.Time                   `json:"exported_at"`
}

type AccountExportProfile struct {
	ID          uuid.UUID  `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	DisplayName *string    `json:"display_name"`
	Bio         string     `json:"bio"`
	Pronouns    string     `json:"pronouns"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
}

type AccountExportServer struct {
	ID       uuid.UUID `json:"id"`
	Name     string    `json:"name"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type AccountExportConversation struct {
	ID           uuid.UUID `json:"id"`
	IsGroup      bool      `json:"is_group"`
	Participants []string  `json:"participants"`
	CreatedAt    time.Time `json:"created_at"`
}

// ExportAccountData packages user profile, server memberships, and DM
// conversation metadata into a JSON bundle.
func (s *ExportService) ExportAccountData(ctx context.Context, userID uuid.UUID) ([]byte, error) {
	// Get user profile
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Get user servers
	servers, err := s.queries.GetUserServers(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Build server list with membership info
	exportServers := make([]AccountExportServer, 0, len(servers))
	for _, srv := range servers {
		member, err := s.queries.GetServerMember(ctx, srv.ID, userID)
		if err != nil {
			continue
		}
		exportServers = append(exportServers, AccountExportServer{
			ID:       srv.ID,
			Name:     srv.Name,
			Role:     member.Role,
			JoinedAt: member.JoinedAt,
		})
	}

	// Get DM conversations
	convos, err := s.queries.GetUserDMConversations(ctx, userID)
	if err != nil {
		return nil, err
	}

	exportConvos := make([]AccountExportConversation, 0, len(convos))
	for _, c := range convos {
		participants, err := s.queries.GetDMParticipants(ctx, c.ID)
		if err != nil {
			continue
		}
		usernames := make([]string, len(participants))
		for i, p := range participants {
			usernames[i] = p.Username
		}
		exportConvos = append(exportConvos, AccountExportConversation{
			ID:           c.ID,
			IsGroup:      c.IsGroup,
			Participants: usernames,
			CreatedAt:    c.CreatedAt,
		})
	}

	export := AccountExport{
		Profile: AccountExportProfile{
			ID:          user.ID,
			Username:    user.Username,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			Bio:         user.Bio,
			Pronouns:    user.Pronouns,
			Status:      user.Status,
			CreatedAt:   user.CreatedAt,
		},
		Servers:         exportServers,
		DMConversations: exportConvos,
		ExportedAt:      time.Now().UTC(),
	}

	return json.MarshalIndent(export, "", "  ")
}
