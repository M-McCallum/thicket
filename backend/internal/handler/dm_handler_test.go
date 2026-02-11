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
	"github.com/M-McCallum/thicket/internal/service"
)

func TestCreateDMConversation_201(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)

	req := authRequest(http.MethodPost, "/api/dm/conversations",
		user1.AccessToken, map[string]string{"participant_id": user2.User.ID.String()})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var conv service.ConversationWithParticipants
	parseJSON(t, resp, &conv)
	assert.NotEqual(t, uuid.Nil, conv.ID)
	assert.Len(t, conv.Participants, 2)
}

func TestCreateDMConversation_201_Dedup(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)

	req1 := authRequest(http.MethodPost, "/api/dm/conversations",
		user1.AccessToken, map[string]string{"participant_id": user2.User.ID.String()})
	resp1, err := app.Test(req1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp1.StatusCode)

	var conv1 service.ConversationWithParticipants
	parseJSON(t, resp1, &conv1)

	req2 := authRequest(http.MethodPost, "/api/dm/conversations",
		user1.AccessToken, map[string]string{"participant_id": user2.User.ID.String()})
	resp2, err := app.Test(req2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp2.StatusCode)

	var conv2 service.ConversationWithParticipants
	parseJSON(t, resp2, &conv2)
	assert.Equal(t, conv1.ID, conv2.ID)
}

func TestCreateDMConversation_400_MissingParticipant(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodPost, "/api/dm/conversations",
		user.AccessToken, map[string]string{"participant_id": "not-a-uuid"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateDMConversation_400_SelfDM(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodPost, "/api/dm/conversations",
		user.AccessToken, map[string]string{"participant_id": user.User.ID.String()})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetDMConversations_200(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)

	// Create a conversation first
	createReq := authRequest(http.MethodPost, "/api/dm/conversations",
		user1.AccessToken, map[string]string{"participant_id": user2.User.ID.String()})
	createResp, err := app.Test(createReq)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, createResp.StatusCode)
	createResp.Body.Close()

	req := authRequest(http.MethodGet, "/api/dm/conversations", user1.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var convos []service.ConversationWithParticipants
	parseJSON(t, resp, &convos)
	assert.GreaterOrEqual(t, len(convos), 1)
}

func TestGetDMConversations_200_Empty(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodGet, "/api/dm/conversations", user.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var convos []service.ConversationWithParticipants
	parseJSON(t, resp, &convos)
	assert.Empty(t, convos)
}

func TestGetDMMessages_200(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv := createDMConversation(t, ctx, user1.User.ID, user2.User.ID)
	createDMMessageInDB(t, ctx, conv.ID, user1.User.ID, "hello DM")

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/dm/conversations/%s/messages", conv.ID),
		user1.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var messages []models.DMMessageWithAuthor
	parseJSON(t, resp, &messages)
	assert.GreaterOrEqual(t, len(messages), 1)
}

func TestGetDMMessages_403_NotParticipant(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	conv := createDMConversation(t, ctx, user1.User.ID, user2.User.ID)

	req := authRequest(http.MethodGet, fmt.Sprintf("/api/dm/conversations/%s/messages", conv.ID),
		outsider.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGetDMMessages_400_BadUUID(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodGet, "/api/dm/conversations/bad-uuid/messages",
		user.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetDMMessages_200_Pagination(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv := createDMConversation(t, ctx, user1.User.ID, user2.User.ID)
	createDMMessageInDB(t, ctx, conv.ID, user1.User.ID, "msg1")

	req := authRequest(http.MethodGet,
		fmt.Sprintf("/api/dm/conversations/%s/messages?limit=10", conv.ID),
		user1.AccessToken, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestSendDM_201(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv := createDMConversation(t, ctx, user1.User.ID, user2.User.ID)

	req := authRequest(http.MethodPost,
		fmt.Sprintf("/api/dm/conversations/%s/messages", conv.ID),
		user1.AccessToken, map[string]string{"content": "hello DM"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var msg models.DMMessage
	parseJSON(t, resp, &msg)
	assert.Equal(t, "hello DM", msg.Content)
}

func TestSendDM_403_NotParticipant(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)
	outsider := createUser(t)
	ctx := context.Background()

	conv := createDMConversation(t, ctx, user1.User.ID, user2.User.ID)

	req := authRequest(http.MethodPost,
		fmt.Sprintf("/api/dm/conversations/%s/messages", conv.ID),
		outsider.AccessToken, map[string]string{"content": "hello"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestSendDM_400_EmptyContent(t *testing.T) {
	app := setupApp()
	user1 := createUser(t)
	user2 := createUser(t)
	ctx := context.Background()

	conv := createDMConversation(t, ctx, user1.User.ID, user2.User.ID)

	req := authRequest(http.MethodPost,
		fmt.Sprintf("/api/dm/conversations/%s/messages", conv.ID),
		user1.AccessToken, map[string]string{"content": ""})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSendDM_404_NotFound(t *testing.T) {
	app := setupApp()
	user := createUser(t)

	req := authRequest(http.MethodPost,
		fmt.Sprintf("/api/dm/conversations/%s/messages", uuid.New()),
		user.AccessToken, map[string]string{"content": "hello"})
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// createDMConversation creates a DM conversation between two users for test setup.
func createDMConversation(t *testing.T, ctx context.Context, user1ID, user2ID uuid.UUID) models.DMConversation {
	t.Helper()
	q := queries()
	conv, err := q.CreateDMConversation(ctx, models.CreateDMConversationParams{
		IsGroup: false,
		Name:    nil,
	})
	require.NoError(t, err)
	require.NoError(t, q.AddDMParticipant(ctx, conv.ID, user1ID))
	require.NoError(t, q.AddDMParticipant(ctx, conv.ID, user2ID))
	return conv
}

// createDMMessageInDB inserts a DM message directly for test setup.
func createDMMessageInDB(t *testing.T, ctx context.Context, conversationID, authorID uuid.UUID, content string) models.DMMessage {
	t.Helper()
	msg, err := queries().CreateDMMessage(ctx, models.CreateDMMessageParams{
		ConversationID: conversationID,
		AuthorID:       authorID,
		Content:        content,
	})
	require.NoError(t, err)
	return msg
}
