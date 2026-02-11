package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID          uuid.UUID `json:"id"`
	Username    string    `json:"username"`
	Email       string    `json:"email"`
	AvatarURL   *string   `json:"avatar_url"`
	DisplayName *string   `json:"display_name"`
	Status      string    `json:"status"`
	KratosID    uuid.UUID `json:"kratos_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Server struct {
	ID         uuid.UUID  `json:"id"`
	Name       string     `json:"name"`
	IconURL    *string    `json:"icon_url"`
	OwnerID    uuid.UUID  `json:"owner_id"`
	InviteCode string     `json:"invite_code"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type ServerMember struct {
	ServerID uuid.UUID  `json:"server_id"`
	UserID   uuid.UUID  `json:"user_id"`
	Role     string     `json:"role"`
	Nickname *string    `json:"nickname"`
	JoinedAt time.Time  `json:"joined_at"`
}

type Channel struct {
	ID        uuid.UUID `json:"id"`
	ServerID  uuid.UUID `json:"server_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Position  int32     `json:"position"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID        uuid.UUID `json:"id"`
	ChannelID uuid.UUID `json:"channel_id"`
	AuthorID  uuid.UUID `json:"author_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MessageWithAuthor struct {
	Message
	AuthorUsername    string  `json:"author_username"`
	AuthorDisplayName *string `json:"author_display_name"`
	AuthorAvatarURL  *string `json:"author_avatar_url"`
}

type DMConversation struct {
	ID        uuid.UUID `json:"id"`
	IsGroup   bool      `json:"is_group"`
	Name      *string   `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type DMParticipant struct {
	ConversationID uuid.UUID `json:"conversation_id"`
	UserID         uuid.UUID `json:"user_id"`
	JoinedAt       time.Time `json:"joined_at"`
}

type DMMessage struct {
	ID             uuid.UUID `json:"id"`
	ConversationID uuid.UUID `json:"conversation_id"`
	AuthorID       uuid.UUID `json:"author_id"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type DMMessageWithAuthor struct {
	DMMessage
	AuthorUsername    string  `json:"author_username"`
	AuthorDisplayName *string `json:"author_display_name"`
	AuthorAvatarURL  *string `json:"author_avatar_url"`
}

type ServerMemberWithUser struct {
	ID          uuid.UUID `json:"id"`
	Username    string    `json:"username"`
	DisplayName *string   `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url"`
	Status      string    `json:"status"`
	Role        string    `json:"role"`
	Nickname    *string   `json:"nickname"`
}

type DMParticipantUser struct {
	ID          uuid.UUID `json:"id"`
	Username    string    `json:"username"`
	DisplayName *string   `json:"display_name"`
	AvatarURL   *string   `json:"avatar_url"`
	Status      string    `json:"status"`
}
