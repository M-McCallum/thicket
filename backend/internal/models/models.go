package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID                    uuid.UUID  `json:"id"`
	Username              string     `json:"username"`
	Email                 string     `json:"email"`
	AvatarURL             *string    `json:"avatar_url"`
	DisplayName           *string    `json:"display_name"`
	Status                string     `json:"status"`
	KratosID              uuid.UUID  `json:"kratos_id"`
	Bio                   string     `json:"bio"`
	Pronouns              string     `json:"pronouns"`
	CustomStatusText      string     `json:"custom_status_text"`
	CustomStatusEmoji     string     `json:"custom_status_emoji"`
	CustomStatusExpiresAt *time.Time `json:"custom_status_expires_at"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
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
	Type      string    `json:"type"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MessageWithAuthor struct {
	Message
	AuthorUsername    string        `json:"author_username"`
	AuthorDisplayName *string       `json:"author_display_name"`
	AuthorAvatarURL  *string        `json:"author_avatar_url"`
	Attachments      []Attachment   `json:"attachments"`
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
	Type           string    `json:"type"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type DMMessageWithAuthor struct {
	DMMessage
	AuthorUsername    string       `json:"author_username"`
	AuthorDisplayName *string      `json:"author_display_name"`
	AuthorAvatarURL  *string       `json:"author_avatar_url"`
	Attachments      []Attachment  `json:"attachments"`
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

// Attachment represents a file attached to a message.
type Attachment struct {
	ID               uuid.UUID  `json:"id"`
	MessageID        *uuid.UUID `json:"message_id,omitempty"`
	DMMessageID      *uuid.UUID `json:"dm_message_id,omitempty"`
	Filename         string     `json:"filename"`
	OriginalFilename string     `json:"original_filename"`
	ContentType      string     `json:"content_type"`
	Size             int64      `json:"size"`
	Width            *int       `json:"width,omitempty"`
	Height           *int       `json:"height,omitempty"`
	ObjectKey        string     `json:"object_key"`
	URL              string     `json:"url"`
	IsExternal       bool       `json:"is_external"`
	CreatedAt        time.Time  `json:"created_at"`
}

// CustomEmoji represents a server custom emoji.
type CustomEmoji struct {
	ID        uuid.UUID `json:"id"`
	ServerID  uuid.UUID `json:"server_id"`
	Name      string    `json:"name"`
	ObjectKey string    `json:"object_key"`
	URL       string    `json:"url"`
	CreatorID uuid.UUID `json:"creator_id"`
	CreatedAt time.Time `json:"created_at"`
}

// StickerPack is a collection of stickers.
type StickerPack struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	ServerID    *uuid.UUID `json:"server_id,omitempty"`
	CreatorID   uuid.UUID  `json:"creator_id"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Sticker is a single sticker in a pack.
type Sticker struct {
	ID        uuid.UUID `json:"id"`
	PackID    uuid.UUID `json:"pack_id"`
	Name      string    `json:"name"`
	ObjectKey string    `json:"object_key"`
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"created_at"`
}

// Friendship represents a friend/block relationship.
type Friendship struct {
	ID          uuid.UUID `json:"id"`
	RequesterID uuid.UUID `json:"requester_id"`
	AddresseeID uuid.UUID `json:"addressee_id"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// FriendshipWithUser includes user details.
type FriendshipWithUser struct {
	Friendship
	Username    string  `json:"username"`
	DisplayName *string `json:"display_name"`
	AvatarURL   *string `json:"avatar_url"`
	UserStatus  string  `json:"user_status"`
}
