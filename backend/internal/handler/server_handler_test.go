package handler

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/testutil"
)

func TestCreateServer_201(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodPost, "/api/servers", user.AccessToken, map[string]string{"name": "Test Server"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var body struct {
		Server  models.Server  `json:"server"`
		Channel models.Channel `json:"channel"`
	}
	parseJSON(t, resp, &body)
	assert.Equal(t, "Test Server", body.Server.Name)
	assert.Equal(t, "general", body.Channel.Name)
}

func TestCreateServer_400_InvalidName(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodPost, "/api/servers", user.AccessToken, map[string]string{"name": ""})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateServer_401_NoAuth(t *testing.T) {
	app := setupApp()

	req := authRequest(http.MethodPost, "/api/servers", "", map[string]string{"name": "Test"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestGetServer_200(t *testing.T) {
	app := setupApp()
	user := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), user.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/servers/%s", server.ID), user.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body models.Server
	parseJSON(t, resp, &body)
	assert.Equal(t, server.ID, body.ID)
}

func TestGetServer_403_NotMember(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	other := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/servers/%s", server.ID), other.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGetServer_400_BadUUID(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodGet, "/api/servers/bad", user.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetUserServers_200(t *testing.T) {
	app := setupApp()
	user := createUser(t)
	ctx := context.Background()

	_, _, err := testutil.CreateTestServer(ctx, queries(), user.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, "/api/servers", user.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var servers []models.Server
	parseJSON(t, resp, &servers)
	assert.GreaterOrEqual(t, len(servers), 1)
}

func TestJoinServer_200(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	joiner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodPost, "/api/servers/join", joiner.AccessToken, map[string]string{"invite_code": server.InviteCode})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestJoinServer_409_Already(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodPost, "/api/servers/join", owner.AccessToken, map[string]string{"invite_code": server.InviteCode})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusConflict, resp.StatusCode)
}

func TestLeaveServer_200(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	req := authRequest(http.MethodPost, fmt.Sprintf("/api/servers/%s/leave", server.ID), member.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestLeaveServer_403_Owner(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodPost, fmt.Sprintf("/api/servers/%s/leave", server.ID), owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestDeleteServer_200(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodDelete, fmt.Sprintf("/api/servers/%s", server.ID), owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDeleteServer_403_NotOwner(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	req := authRequest(http.MethodDelete, fmt.Sprintf("/api/servers/%s", server.ID), member.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGetMembers_200(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/servers/%s/members", server.ID), owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var members []models.ServerMemberWithUser
	parseJSON(t, resp, &members)
	assert.Len(t, members, 1)
}

func TestGetMembers_403_NotMember(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/servers/%s/members", server.ID), outsider.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// --- Channel handler tests ---

func TestCreateChannel_201(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodPost, fmt.Sprintf("/api/servers/%s/channels", server.ID), owner.AccessToken,
		map[string]string{"name": "dev", "type": "text"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var ch models.Channel
	parseJSON(t, resp, &ch)
	assert.Equal(t, "dev", ch.Name)
}

func TestCreateChannel_403_MemberDenied(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	req := authRequest(http.MethodPost, fmt.Sprintf("/api/servers/%s/channels", server.ID), member.AccessToken,
		map[string]string{"name": "nope", "type": "text"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGetChannels_200(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/servers/%s/channels", server.ID), owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var channels []models.Channel
	parseJSON(t, resp, &channels)
	assert.Len(t, channels, 1)
}

func TestGetChannels_403_NotMember(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	server, _, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/servers/%s/channels", server.ID), outsider.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGetServer_404_NotFound(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/servers/%s", uuid.New()), user.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	// Not a member of a non-existent server → 403 (NotMember)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}
