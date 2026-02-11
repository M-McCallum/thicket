package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/M-McCallum/thicket/internal/testutil"
)

func TestSendMessage_Success(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	_ = server

	msg, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "hello world")
	require.NoError(t, err)
	assert.Equal(t, "hello world", msg.Content)
	assert.Equal(t, channel.ID, msg.ChannelID)
	assert.Equal(t, owner.User.ID, msg.AuthorID)
	assert.NotZero(t, msg.CreatedAt)
}

func TestSendMessage_NotMember(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.SendMessage(ctx, channel.ID, outsider.User.ID, "hello")
	assert.ErrorIs(t, err, ErrNotMember)
}

func TestSendMessage_EmptyContent(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.SendMessage(ctx, channel.ID, owner.User.ID, "")
	assert.ErrorIs(t, err, ErrEmptyMessage)
}

func TestSendMessage_HTMLSanitized(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	msg, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "<b>hello</b>")
	require.NoError(t, err)
	assert.Equal(t, "hello", msg.Content)
}

func TestSendMessage_ScriptTagBecomesEmpty(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.SendMessage(ctx, channel.ID, owner.User.ID, "<script>alert('x')</script>")
	assert.ErrorIs(t, err, ErrEmptyMessage)
}

func TestGetMessages_Success(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.SendMessage(ctx, channel.ID, owner.User.ID, "msg1")
	require.NoError(t, err)
	_, err = svc.SendMessage(ctx, channel.ID, owner.User.ID, "msg2")
	require.NoError(t, err)

	messages, err := svc.GetMessages(ctx, channel.ID, owner.User.ID, nil, 50)
	require.NoError(t, err)
	assert.Len(t, messages, 2)
	// DESC order — newest first
	assert.Equal(t, "msg2", messages[0].Content)
	assert.Equal(t, "msg1", messages[1].Content)
	assert.NotEmpty(t, messages[0].AuthorUsername)
}

func TestGetMessages_NotMember(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.GetMessages(ctx, channel.ID, outsider.User.ID, nil, 50)
	assert.ErrorIs(t, err, ErrNotMember)
}

func TestGetMessages_DefaultLimit(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	// limit=0 should default to 50 (not error)
	messages, err := svc.GetMessages(ctx, channel.ID, owner.User.ID, nil, 0)
	require.NoError(t, err)
	assert.NotNil(t, messages)
}

func TestGetMessages_CursorPagination(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.SendMessage(ctx, channel.ID, owner.User.ID, "old")
	require.NoError(t, err)
	time.Sleep(10 * time.Millisecond) // ensure different timestamps
	msg2, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "new")
	require.NoError(t, err)

	// Get messages before the newest
	before := msg2.CreatedAt
	messages, err := svc.GetMessages(ctx, channel.ID, owner.User.ID, &before, 50)
	require.NoError(t, err)
	assert.Len(t, messages, 1)
	assert.Equal(t, "old", messages[0].Content)
}

func TestUpdateMessage_Success(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	msg, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "original")
	require.NoError(t, err)

	updated, err := svc.UpdateMessage(ctx, msg.ID, owner.User.ID, "edited")
	require.NoError(t, err)
	assert.Equal(t, "edited", updated.Content)
	assert.Equal(t, msg.ID, updated.ID)
}

func TestUpdateMessage_NotAuthor(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	other := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, other.User.ID, "member"))

	msg, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "original")
	require.NoError(t, err)

	_, err = svc.UpdateMessage(ctx, msg.ID, other.User.ID, "hacked")
	assert.ErrorIs(t, err, ErrNotAuthor)
}

func TestUpdateMessage_NotFound(t *testing.T) {
	svc := NewMessageService(queries())
	user := createUser(t)

	_, err := svc.UpdateMessage(context.Background(), uuid.New(), user.User.ID, "nope")
	assert.ErrorIs(t, err, ErrMessageNotFound)
}

func TestUpdateMessage_EmptyContent(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	msg, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "original")
	require.NoError(t, err)

	_, err = svc.UpdateMessage(ctx, msg.ID, owner.User.ID, "")
	assert.ErrorIs(t, err, ErrEmptyMessage)
}

func TestDeleteMessage_ByAuthor(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	msg, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "delete me")
	require.NoError(t, err)

	err = svc.DeleteMessage(ctx, msg.ID, owner.User.ID)
	require.NoError(t, err)
}

func TestDeleteMessage_ByOwner(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	msg, err := svc.SendMessage(ctx, channel.ID, member.User.ID, "member msg")
	require.NoError(t, err)

	// Owner can delete any message
	err = svc.DeleteMessage(ctx, msg.ID, owner.User.ID)
	require.NoError(t, err)
}

func TestDeleteMessage_ByAdmin(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	admin := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, admin.User.ID, "admin"))
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	msg, err := svc.SendMessage(ctx, channel.ID, member.User.ID, "member msg")
	require.NoError(t, err)

	// Admin can delete any message
	err = svc.DeleteMessage(ctx, msg.ID, admin.User.ID)
	require.NoError(t, err)
}

func TestDeleteMessage_ByMember_Denied(t *testing.T) {
	svc := NewMessageService(queries())
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	msg, err := svc.SendMessage(ctx, channel.ID, owner.User.ID, "owner msg")
	require.NoError(t, err)

	// Regular member can't delete others' messages
	err = svc.DeleteMessage(ctx, msg.ID, member.User.ID)
	assert.ErrorIs(t, err, ErrNotAuthor)
}

func TestDeleteMessage_NotFound(t *testing.T) {
	svc := NewMessageService(queries())
	user := createUser(t)

	err := svc.DeleteMessage(context.Background(), uuid.New(), user.User.ID)
	assert.ErrorIs(t, err, ErrMessageNotFound)
}
