package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/microcosm-cc/bluemonday"

	"github.com/M-McCallum/thicket/internal/models"
)

var (
	ErrForumPostNotFound = errors.New("forum post not found")
	ErrForumTagNotFound  = errors.New("forum tag not found")
	ErrNotForumChannel   = errors.New("channel is not a forum channel")
	ErrEmptyTitle        = errors.New("forum post title cannot be empty")
	ErrEmptyTagName      = errors.New("tag name cannot be empty")
)

type ForumService struct {
	queries   *models.Queries
	permSvc   *PermissionService
	sanitizer *bluemonday.Policy
}

func NewForumService(q *models.Queries, permSvc *PermissionService) *ForumService {
	return &ForumService{
		queries:   q,
		permSvc:   permSvc,
		sanitizer: bluemonday.StrictPolicy(),
	}
}

func (s *ForumService) Queries() *models.Queries {
	return s.queries
}

// verifyForumChannel checks that the channel exists and is a forum channel.
// Returns the channel and server membership verification.
func (s *ForumService) verifyForumChannel(ctx context.Context, channelID, userID uuid.UUID) (models.Channel, error) {
	channel, err := s.queries.GetChannelByID(ctx, channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return channel, ErrChannelNotFound
		}
		return channel, err
	}
	if channel.Type != "forum" {
		return channel, ErrNotForumChannel
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return channel, ErrNotMember
		}
		return channel, err
	}
	return channel, nil
}

// --- Tags ---

func (s *ForumService) GetTags(ctx context.Context, channelID, userID uuid.UUID) ([]models.ForumTag, error) {
	if _, err := s.verifyForumChannel(ctx, channelID, userID); err != nil {
		return nil, err
	}
	return s.queries.GetForumTagsByChannel(ctx, channelID)
}

func (s *ForumService) CreateTag(ctx context.Context, channelID, userID uuid.UUID, name, color, emoji string, position int, moderated bool) (*models.ForumTag, error) {
	channel, err := s.verifyForumChannel(ctx, channelID, userID)
	if err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrEmptyTagName
	}

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	tag, err := s.queries.CreateForumTag(ctx, models.CreateForumTagParams{
		ChannelID: channelID,
		Name:      name,
		Color:     color,
		Emoji:     emoji,
		Position:  position,
		Moderated: moderated,
	})
	if err != nil {
		return nil, err
	}
	return &tag, nil
}

func (s *ForumService) UpdateTag(ctx context.Context, channelID, tagID, userID uuid.UUID, params models.UpdateForumTagParams) (*models.ForumTag, error) {
	channel, err := s.verifyForumChannel(ctx, channelID, userID)
	if err != nil {
		return nil, err
	}

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrInsufficientRole
	}

	// Verify tag belongs to this channel
	tag, err := s.queries.GetForumTagByID(ctx, tagID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrForumTagNotFound
		}
		return nil, err
	}
	if tag.ChannelID != channelID {
		return nil, ErrForumTagNotFound
	}

	params.ID = tagID
	updated, err := s.queries.UpdateForumTag(ctx, params)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func (s *ForumService) DeleteTag(ctx context.Context, channelID, tagID, userID uuid.UUID) error {
	channel, err := s.verifyForumChannel(ctx, channelID, userID)
	if err != nil {
		return err
	}

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	tag, err := s.queries.GetForumTagByID(ctx, tagID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrForumTagNotFound
		}
		return err
	}
	if tag.ChannelID != channelID {
		return ErrForumTagNotFound
	}

	return s.queries.DeleteForumTag(ctx, tagID)
}

// --- Posts ---

func (s *ForumService) GetPosts(ctx context.Context, channelID, userID uuid.UUID, sortBy string, tagIDs []uuid.UUID, limit, offset int) ([]models.ForumPostWithMeta, error) {
	if _, err := s.verifyForumChannel(ctx, channelID, userID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}
	return s.queries.GetForumPosts(ctx, channelID, sortBy, tagIDs, limit, offset)
}

func (s *ForumService) CreatePost(ctx context.Context, channelID, userID uuid.UUID, title, content string, tagIDs []uuid.UUID) (*models.ForumPostWithMeta, error) {
	_, err := s.verifyForumChannel(ctx, channelID, userID)
	if err != nil {
		return nil, err
	}

	title = s.sanitizer.Sanitize(strings.TrimSpace(title))
	if title == "" {
		return nil, ErrEmptyTitle
	}
	content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	if content == "" {
		return nil, ErrEmptyMessage
	}

	// Create the forum post
	post, err := s.queries.CreateForumPost(ctx, models.CreateForumPostParams{
		ChannelID: channelID,
		AuthorID:  userID,
		Title:     title,
	})
	if err != nil {
		return nil, err
	}

	// Set tags
	if len(tagIDs) > 0 {
		if err := s.queries.SetForumPostTags(ctx, post.ID, tagIDs); err != nil {
			return nil, err
		}
	}

	// Create the initial message
	_, err = s.queries.CreateForumPostMessage(ctx, models.CreateForumPostMessageParams{
		PostID:   post.ID,
		AuthorID: userID,
		Content:  content,
	})
	if err != nil {
		return nil, err
	}

	// Fetch author info
	author, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	tags, _ := s.queries.GetForumPostTags(ctx, post.ID)

	result := &models.ForumPostWithMeta{
		ForumPost:         post,
		AuthorUsername:    author.Username,
		AuthorDisplayName: author.DisplayName,
		AuthorAvatarURL:  author.AvatarURL,
		Tags:             tags,
		ReplyCount:       1,
		LastActivityAt:   post.CreatedAt,
		ContentPreview:   content,
	}

	return result, nil
}

func (s *ForumService) GetPost(ctx context.Context, postID, userID uuid.UUID) (*models.ForumPostWithMeta, error) {
	post, err := s.queries.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrForumPostNotFound
		}
		return nil, err
	}

	// Verify membership
	channel, err := s.queries.GetChannelByID(ctx, post.ChannelID)
	if err != nil {
		return nil, err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	author, err := s.queries.GetUserByID(ctx, post.AuthorID)
	if err != nil {
		return nil, err
	}

	tags, _ := s.queries.GetForumPostTags(ctx, post.ID)
	messages, _ := s.queries.GetForumPostMessages(ctx, post.ID, 1, 0)
	preview := ""
	replyCount := 0
	if len(messages) > 0 {
		preview = messages[0].Content
	}

	// Get total message count
	allMessages, _ := s.queries.GetForumPostMessages(ctx, post.ID, 10000, 0)
	replyCount = len(allMessages)

	result := &models.ForumPostWithMeta{
		ForumPost:         post,
		AuthorUsername:    author.Username,
		AuthorDisplayName: author.DisplayName,
		AuthorAvatarURL:  author.AvatarURL,
		Tags:             tags,
		ReplyCount:       replyCount,
		LastActivityAt:   post.UpdatedAt,
		ContentPreview:   preview,
	}

	return result, nil
}

func (s *ForumService) DeletePost(ctx context.Context, postID, userID uuid.UUID) error {
	post, err := s.queries.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrForumPostNotFound
		}
		return err
	}

	channel, err := s.queries.GetChannelByID(ctx, post.ChannelID)
	if err != nil {
		return err
	}

	// Allow author or users with ManageChannels permission
	if post.AuthorID != userID {
		ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
		if err != nil {
			return err
		}
		if !ok {
			return ErrNotMember
		}
	}

	return s.queries.DeleteForumPost(ctx, postID)
}

func (s *ForumService) UpdatePostTags(ctx context.Context, postID, userID uuid.UUID, tagIDs []uuid.UUID) error {
	post, err := s.queries.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrForumPostNotFound
		}
		return err
	}

	channel, err := s.queries.GetChannelByID(ctx, post.ChannelID)
	if err != nil {
		return err
	}

	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		return err
	}

	return s.queries.SetForumPostTags(ctx, postID, tagIDs)
}

func (s *ForumService) PinPost(ctx context.Context, postID, userID uuid.UUID, pinned bool) error {
	post, err := s.queries.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrForumPostNotFound
		}
		return err
	}

	channel, err := s.queries.GetChannelByID(ctx, post.ChannelID)
	if err != nil {
		return err
	}

	ok, err := s.permSvc.HasServerPermission(ctx, channel.ServerID, userID, models.PermManageChannels)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInsufficientRole
	}

	return s.queries.SetForumPostPinned(ctx, postID, pinned)
}

// --- Post Messages ---

func (s *ForumService) GetPostMessages(ctx context.Context, postID, userID uuid.UUID, limit, offset int) ([]models.ForumPostMessageWithAuthor, error) {
	post, err := s.queries.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrForumPostNotFound
		}
		return nil, err
	}

	channel, err := s.queries.GetChannelByID(ctx, post.ChannelID)
	if err != nil {
		return nil, err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	return s.queries.GetForumPostMessages(ctx, postID, limit, offset)
}

func (s *ForumService) CreatePostMessage(ctx context.Context, postID, userID uuid.UUID, content string) (*models.ForumPostMessageWithAuthor, error) {
	post, err := s.queries.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrForumPostNotFound
		}
		return nil, err
	}

	channel, err := s.queries.GetChannelByID(ctx, post.ChannelID)
	if err != nil {
		return nil, err
	}
	if _, err := s.queries.GetServerMember(ctx, channel.ServerID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotMember
		}
		return nil, err
	}

	content = s.sanitizer.Sanitize(strings.TrimSpace(content))
	if content == "" {
		return nil, ErrEmptyMessage
	}

	msg, err := s.queries.CreateForumPostMessage(ctx, models.CreateForumPostMessageParams{
		PostID:   postID,
		AuthorID: userID,
		Content:  content,
	})
	if err != nil {
		return nil, err
	}

	// Update post's updated_at to reflect new activity
	_ = s.queries.TouchForumPostUpdatedAt(ctx, postID)

	author, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	result := &models.ForumPostMessageWithAuthor{
		ForumPostMessage: msg,
		AuthorUsername:    author.Username,
		AuthorDisplayName: author.DisplayName,
		AuthorAvatarURL:  author.AvatarURL,
	}

	return result, nil
}

// DeletePostMessage deletes a forum post message if the user is the author.
func (s *ForumService) DeletePostMessage(ctx context.Context, postID, messageID, userID uuid.UUID) error {
	msg, err := s.queries.GetForumPostMessageByID(ctx, messageID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrForumPostNotFound
		}
		return err
	}
	if msg.PostID != postID {
		return ErrForumPostNotFound
	}
	if msg.AuthorID != userID {
		return ErrNotMember
	}
	return s.queries.DeleteForumPostMessage(ctx, messageID)
}

// GetPostChannelID returns the channel ID for a given forum post.
func (s *ForumService) GetPostChannelID(ctx context.Context, postID uuid.UUID) (uuid.UUID, error) {
	post, err := s.queries.GetForumPostByID(ctx, postID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrForumPostNotFound
		}
		return uuid.Nil, err
	}
	return post.ChannelID, nil
}
