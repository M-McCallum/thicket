package service

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/M-McCallum/thicket/internal/testutil"
)

func TestCreateServer_Success(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)

	server, channel, err := svc.CreateServer(context.Background(), "My Server", user.User.ID)
	require.NoError(t, err)
	assert.Equal(t, "My Server", server.Name)
	assert.Equal(t, user.User.ID, server.OwnerID)
	assert.NotEmpty(t, server.InviteCode)
	assert.Equal(t, "general", channel.Name)
	assert.Equal(t, "text", channel.Type)
	assert.Equal(t, server.ID, channel.ServerID)

	// Verify owner membership
	member, err := queries().GetServerMember(context.Background(), server.ID, user.User.ID)
	require.NoError(t, err)
	assert.Equal(t, "owner", member.Role)
}

func TestCreateServer_InvalidName_Empty(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)

	_, _, err := svc.CreateServer(context.Background(), "", user.User.ID)
	assert.ErrorIs(t, err, ErrInvalidServerName)
}

func TestCreateServer_InvalidName_TooLong(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)

	longName := strings.Repeat("a", 101)
	_, _, err := svc.CreateServer(context.Background(), longName, user.User.ID)
	assert.ErrorIs(t, err, ErrInvalidServerName)
}

func TestGetServer_Success(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), user.User.ID)
	require.NoError(t, err)

	got, err := svc.GetServer(ctx, server.ID, user.User.ID)
	require.NoError(t, err)
	assert.Equal(t, server.ID, got.ID)
	assert.Equal(t, server.Name, got.Name)
}

func TestGetServer_NotMember(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	other := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.GetServer(ctx, server.ID, other.User.ID)
	assert.ErrorIs(t, err, ErrNotMember)
}

func TestJoinServer_Success(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	joiner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	joined, err := svc.JoinServer(ctx, server.InviteCode, joiner.User.ID)
	require.NoError(t, err)
	assert.Equal(t, server.ID, joined.ID)

	member, err := queries().GetServerMember(ctx, server.ID, joiner.User.ID)
	require.NoError(t, err)
	assert.Equal(t, "member", member.Role)
}

func TestJoinServer_AlreadyMember(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.JoinServer(ctx, server.InviteCode, owner.User.ID)
	assert.ErrorIs(t, err, ErrAlreadyMember)
}

func TestJoinServer_InvalidCode(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)

	_, err := svc.JoinServer(context.Background(), "nonexistent", user.User.ID)
	assert.ErrorIs(t, err, ErrServerNotFound)
}

func TestLeaveServer_Success(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	err = svc.LeaveServer(ctx, server.ID, member.User.ID)
	require.NoError(t, err)
}

func TestLeaveServer_OwnerBlocked(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	err = svc.LeaveServer(ctx, server.ID, owner.User.ID)
	assert.ErrorIs(t, err, ErrOwnerCannotLeave)
}

func TestDeleteServer_Success(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	err = svc.DeleteServer(ctx, server.ID, owner.User.ID)
	require.NoError(t, err)

	// Verify server is gone
	_, err = svc.GetServer(ctx, server.ID, owner.User.ID)
	assert.Error(t, err)
}

func TestDeleteServer_NotOwner(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	err = svc.DeleteServer(ctx, server.ID, member.User.ID)
	assert.ErrorIs(t, err, ErrInsufficientRole)
}

func TestGetUserServers_Success(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)
	ctx := context.Background()

	_, _, err := testutil.CreateTestServer(ctx, queries(), user.User.ID)
	require.NoError(t, err)
	_, _, err = testutil.CreateTestServer(ctx, queries(), user.User.ID)
	require.NoError(t, err)

	servers, err := svc.GetUserServers(ctx, user.User.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(servers), 2)
}

func TestGetUserServers_Empty(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)

	servers, err := svc.GetUserServers(context.Background(), user.User.ID)
	require.NoError(t, err)
	assert.NotNil(t, servers)
	assert.Empty(t, servers)
}

func TestGetMembers_Success(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	members, err := svc.GetMembers(ctx, server.ID, owner.User.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)
}

func TestGetMembers_NotMember(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	_, err = svc.GetMembers(ctx, server.ID, outsider.User.ID)
	assert.ErrorIs(t, err, ErrNotMember)
}

func TestGetServer_NotFound(t *testing.T) {
	svc := NewServerService(queries(), NewPermissionService(queries()))
	user := createUser(t)

	_, err := svc.GetServer(context.Background(), uuid.New(), user.User.ID)
	assert.ErrorIs(t, err, ErrNotMember)
}
