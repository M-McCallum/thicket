package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/mitchell/neoncore/internal/testutil"
)

func TestCreateChannel_Success_Text(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	ch, err := svc.CreateChannel(ctx, server.ID, owner.User.ID, "announcements", "text")
	require.NoError(t, err)
	assert.Equal(t, "announcements", ch.Name)
	assert.Equal(t, "text", ch.Type)
	assert.Equal(t, server.ID, ch.ServerID)
}

func TestCreateChannel_Success_Voice(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	ch, err := svc.CreateChannel(ctx, server.ID, owner.User.ID, "voice-chat", "voice")
	require.NoError(t, err)
	assert.Equal(t, "voice", ch.Type)
}

func TestCreateChannel_AdminAllowed(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	admin := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, admin.User.ID, "admin"))

	ch, err := svc.CreateChannel(ctx, server.ID, admin.User.ID, "admin-channel", "text")
	require.NoError(t, err)
	assert.Equal(t, "admin-channel", ch.Name)
}

func TestCreateChannel_MemberDenied(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	_, err = svc.CreateChannel(ctx, server.ID, member.User.ID, "nope", "text")
	assert.ErrorIs(t, err, ErrInsufficientRole)
}

func TestCreateChannel_NotMember(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.CreateChannel(ctx, server.ID, outsider.User.ID, "nope", "text")
	assert.ErrorIs(t, err, ErrNotMember)
}

func TestCreateChannel_InvalidName_Empty(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.CreateChannel(ctx, server.ID, owner.User.ID, "", "text")
	assert.ErrorIs(t, err, ErrInvalidChannelName)
}

func TestCreateChannel_InvalidType(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.CreateChannel(ctx, server.ID, owner.User.ID, "test", "video")
	assert.ErrorIs(t, err, ErrInvalidChannelType)
}

func TestCreateChannel_AutoPosition(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, generalCh, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	assert.Equal(t, int32(0), generalCh.Position)

	ch, err := svc.CreateChannel(ctx, server.ID, owner.User.ID, "second", "text")
	require.NoError(t, err)
	assert.Equal(t, int32(1), ch.Position)
}

func TestGetChannels_Success(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	channels, err := svc.GetChannels(ctx, server.ID, owner.User.ID)
	require.NoError(t, err)
	assert.Len(t, channels, 1)
	assert.Equal(t, "general", channels[0].Name)
}

func TestGetChannels_NotMember(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.GetChannels(ctx, server.ID, outsider.User.ID)
	assert.ErrorIs(t, err, ErrNotMember)
}

func TestDeleteChannel_OwnerSuccess(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	ch, err := testutil.CreateTestChannel(ctx, queries(), server.ID, "deleteme", "text", 1)
	require.NoError(t, err)

	err = svc.DeleteChannel(ctx, ch.ID, owner.User.ID)
	require.NoError(t, err)
}

func TestDeleteChannel_AdminSuccess(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	admin := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, admin.User.ID, "admin"))

	ch, err := testutil.CreateTestChannel(ctx, queries(), server.ID, "deleteme", "text", 1)
	require.NoError(t, err)

	err = svc.DeleteChannel(ctx, ch.ID, admin.User.ID)
	require.NoError(t, err)
}

func TestDeleteChannel_MemberDenied(t *testing.T) {
	svc := NewChannelService(queries())
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	ch, err := testutil.CreateTestChannel(ctx, queries(), server.ID, "nope", "text", 1)
	require.NoError(t, err)

	err = svc.DeleteChannel(ctx, ch.ID, member.User.ID)
	assert.ErrorIs(t, err, ErrInsufficientRole)
}

func TestDeleteChannel_NotFound(t *testing.T) {
	svc := NewChannelService(queries())
	user := createUser(t)

	err := svc.DeleteChannel(context.Background(), uuid.New(), user.User.ID)
	assert.ErrorIs(t, err, ErrChannelNotFound)
}
