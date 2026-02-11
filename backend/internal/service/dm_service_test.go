package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateConversation_Success(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, conv.ID)
	assert.False(t, conv.IsGroup)
	assert.Len(t, conv.Participants, 2)
}

func TestCreateConversation_Dedup(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv1, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	conv2, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	assert.Equal(t, conv1.ID, conv2.ID)
}

func TestCreateConversation_DedupReverseOrder(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv1, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	conv2, err := svc.CreateConversation(ctx, user2.User.ID, user1.User.ID)
	require.NoError(t, err)

	assert.Equal(t, conv1.ID, conv2.ID)
}

func TestCreateConversation_SelfDM(t *testing.T) {
	svc := NewDMService(queries())
	user := createUser(t)

	_, err := svc.CreateConversation(context.Background(), user.User.ID, user.User.ID)
	assert.ErrorIs(t, err, ErrCannotDMSelf)
}

func TestSendDM_Success(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	msg, err := svc.SendDM(ctx, conv.ID, user1.User.ID, "hello DM")
	require.NoError(t, err)
	assert.Equal(t, "hello DM", msg.Content)
	assert.Equal(t, conv.ID, msg.ConversationID)
	assert.Equal(t, user1.User.ID, msg.AuthorID)
}

func TestSendDM_NotParticipant(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	_, err = svc.SendDM(ctx, conv.ID, outsider.User.ID, "hello")
	assert.ErrorIs(t, err, ErrNotDMParticipant)
}

func TestSendDM_EmptyContent(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	_, err = svc.SendDM(ctx, conv.ID, user1.User.ID, "")
	assert.ErrorIs(t, err, ErrEmptyMessage)
}

func TestSendDM_HTMLSanitized(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	msg, err := svc.SendDM(ctx, conv.ID, user1.User.ID, "<b>hello</b>")
	require.NoError(t, err)
	assert.Equal(t, "hello", msg.Content)
}

func TestSendDM_ScriptTagBecomesEmpty(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	_, err = svc.SendDM(ctx, conv.ID, user1.User.ID, "<script>alert('x')</script>")
	assert.ErrorIs(t, err, ErrEmptyMessage)
}

func TestSendDM_ConversationNotFound(t *testing.T) {
	svc := NewDMService(queries())
	user := createUser(t)

	_, err := svc.SendDM(context.Background(), uuid.New(), user.User.ID, "hello")
	assert.ErrorIs(t, err, ErrConversationNotFound)
}

func TestGetConversations_Success(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	_, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	convos, err := svc.GetConversations(ctx, user1.User.ID)
	require.NoError(t, err)
	assert.Len(t, convos, 1)
	assert.Len(t, convos[0].Participants, 2)
}

func TestGetConversations_Empty(t *testing.T) {
	svc := NewDMService(queries())
	user := createUser(t)

	convos, err := svc.GetConversations(context.Background(), user.User.ID)
	require.NoError(t, err)
	assert.Empty(t, convos)
}

func TestGetConversations_OnlyOwn(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	user3 := createUser(t)
	ctx := context.Background()

	_, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	_, err = svc.CreateConversation(ctx, user2.User.ID, user3.User.ID)
	require.NoError(t, err)

	// user1 should only see their conversation with user2
	convos, err := svc.GetConversations(ctx, user1.User.ID)
	require.NoError(t, err)
	assert.Len(t, convos, 1)
}

func TestGetDMMessages_Success(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	_, err = svc.SendDM(ctx, conv.ID, user1.User.ID, "msg1")
	require.NoError(t, err)
	_, err = svc.SendDM(ctx, conv.ID, user2.User.ID, "msg2")
	require.NoError(t, err)

	messages, err := svc.GetDMMessages(ctx, conv.ID, user1.User.ID, nil, 50)
	require.NoError(t, err)
	assert.Len(t, messages, 2)
	assert.Equal(t, "msg2", messages[0].Content) // DESC order
	assert.NotEmpty(t, messages[0].AuthorUsername)
}

func TestGetDMMessages_NotParticipant(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	_, err = svc.GetDMMessages(ctx, conv.ID, outsider.User.ID, nil, 50)
	assert.ErrorIs(t, err, ErrNotDMParticipant)
}

func TestGetDMMessages_CursorPagination(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	_, err = svc.SendDM(ctx, conv.ID, user1.User.ID, "old")
	require.NoError(t, err)
	time.Sleep(10 * time.Millisecond)
	msg2, err := svc.SendDM(ctx, conv.ID, user1.User.ID, "new")
	require.NoError(t, err)

	before := msg2.CreatedAt
	messages, err := svc.GetDMMessages(ctx, conv.ID, user1.User.ID, &before, 50)
	require.NoError(t, err)
	assert.Len(t, messages, 1)
	assert.Equal(t, "old", messages[0].Content)
}

func TestGetDMMessages_DefaultLimit(t *testing.T) {
	svc := NewDMService(queries())
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv, err := svc.CreateConversation(ctx, user1.User.ID, user2.User.ID)
	require.NoError(t, err)

	messages, err := svc.GetDMMessages(ctx, conv.ID, user1.User.ID, nil, 0)
	require.NoError(t, err)
	assert.NotNil(t, messages)
}

func TestGetDMMessages_ConversationNotFound(t *testing.T) {
	svc := NewDMService(queries())
	user := createUser(t)

	_, err := svc.GetDMMessages(context.Background(), uuid.New(), user.User.ID, nil, 50)
	assert.ErrorIs(t, err, ErrConversationNotFound)
}
