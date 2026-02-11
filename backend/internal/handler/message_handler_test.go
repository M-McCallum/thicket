package handler

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/mitchell/neoncore/internal/models"
	"github.com/mitchell/neoncore/internal/testutil"
)

func TestSendMessage_201(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodPost, fmt.Sprintf("/api/channels/%s/messages", channel.ID),
		owner.AccessToken, map[string]string{"content": "hello"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var msg models.Message
	parseJSON(t, resp, &msg)
	assert.Equal(t, "hello", msg.Content)
	assert.Equal(t, channel.ID, msg.ChannelID)
}

func TestSendMessage_403_NotMember(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodPost, fmt.Sprintf("/api/channels/%s/messages", channel.ID),
		outsider.AccessToken, map[string]string{"content": "hello"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestSendMessage_400_Empty(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodPost, fmt.Sprintf("/api/channels/%s/messages", channel.ID),
		owner.AccessToken, map[string]string{"content": ""})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSendMessage_400_BadChannelID(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodPost, "/api/channels/bad/messages",
		user.AccessToken, map[string]string{"content": "hello"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetMessages_200(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	msgSvc := createMessageInDB(t, ctx, channel.ID, owner.User.ID, "test msg")
	_ = msgSvc

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/channels/%s/messages", channel.ID),
		owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var messages []models.MessageWithAuthor
	parseJSON(t, resp, &messages)
	assert.GreaterOrEqual(t, len(messages), 1)
}

func TestGetMessages_200_WithParams(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	createMessageInDB(t, ctx, channel.ID, owner.User.ID, "msg1")

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/channels/%s/messages?limit=10", channel.ID),
		owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGetMessages_403_NotMember(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/channels/%s/messages", channel.ID),
		outsider.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestUpdateMessage_200(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	msg := createMessageInDB(t, ctx, channel.ID, owner.User.ID, "original")

	req := authRequest(http.MethodPut, fmt.Sprintf("/api/messages/%s", msg.ID),
		owner.AccessToken, map[string]string{"content": "edited"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var updated models.Message
	parseJSON(t, resp, &updated)
	assert.Equal(t, "edited", updated.Content)
}

func TestUpdateMessage_403_NotAuthor(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	other := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, other.User.ID, "member"))

	msg := createMessageInDB(t, ctx, channel.ID, owner.User.ID, "original")

	req := authRequest(http.MethodPut, fmt.Sprintf("/api/messages/%s", msg.ID),
		other.AccessToken, map[string]string{"content": "hacked"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestUpdateMessage_404(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodPut, fmt.Sprintf("/api/messages/%s", uuid.New()),
		user.AccessToken, map[string]string{"content": "nope"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestDeleteMessage_200_ByAuthor(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	ctx := context.Background()

	_, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)

	msg := createMessageInDB(t, ctx, channel.ID, owner.User.ID, "delete me")

	req := authRequest(http.MethodDelete, fmt.Sprintf("/api/messages/%s", msg.ID),
		owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDeleteMessage_200_ByOwner(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	msg := createMessageInDB(t, ctx, channel.ID, member.User.ID, "member msg")

	req := authRequest(http.MethodDelete, fmt.Sprintf("/api/messages/%s", msg.ID),
		owner.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDeleteMessage_403(t *testing.T) {
	app := setupApp()
	owner := createUser(t)
	member := createUser(t)
	ctx := context.Background()

	server, channel, err := testutil.CreateTestServer(ctx, queries(), owner.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(ctx, queries(), server.ID, member.User.ID, "member"))

	msg := createMessageInDB(t, ctx, channel.ID, owner.User.ID, "owner msg")

	req := authRequest(http.MethodDelete, fmt.Sprintf("/api/messages/%s", msg.ID),
		member.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestDeleteMessage_404(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodDelete, fmt.Sprintf("/api/messages/%s", uuid.New()),
		user.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// createMessageInDB inserts a message directly for test setup.
func createMessageInDB(t *testing.T, ctx context.Context, channelID, authorID uuid.UUID, content string) models.Message {
	t.Helper()
	msg, err := queries().CreateMessage(ctx, models.CreateMessageParams{
		ChannelID: channelID,
		AuthorID:  authorID,
		Content:   content,
	})
	require.NoError(t, err)
	return msg
}
