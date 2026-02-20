package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/handler"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/testutil"
	"github.com/M-McCallum/thicket/internal/ws"
)

var (
	testDB     *testutil.TestDB
	jwksServer *testutil.TestJWKSServer
	jwksMgr    *auth.JWKSManager
)

func TestMain(m *testing.M) {
	ctx := context.Background()

	var err error
	testDB, err = testutil.SetupTestDB(ctx)
	if err != nil {
		log.Fatalf("setup test db: %v", err)
	}

	jwksServer = testutil.NewTestJWKSServer()
	jwksMgr = auth.NewJWKSManager(jwksServer.JWKSURL())

	code := m.Run()

	jwksServer.Close()
	testDB.Cleanup(ctx)
	os.Exit(code)
}

type testServer struct {
	app  *fiber.App
	hub  *ws.Hub
	addr string
}

func startTestServer(t *testing.T) *testServer {
	t.Helper()

	q := testDB.Queries
	hub := ws.NewHub()
	go hub.Run()

	messageSvc := service.NewMessageService(q)
	messageHandler := handler.NewMessageHandler(messageSvc, hub)

	app := fiber.New()

	// Protected message routes
	protected := app.Group("/api", auth.Middleware(jwksMgr))
	protected.Post("/channels/:channelId/messages", messageHandler.SendMessage)

	// WebSocket endpoint (no auth middleware — auth is via IDENTIFY)
	app.Get("/ws", ws.Handler(hub, jwksMgr, nil))

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	addr := ln.Addr().String()

	go func() {
		_ = app.Listener(ln)
	}()

	// Give the server a moment to start
	time.Sleep(50 * time.Millisecond)

	t.Cleanup(func() {
		_ = app.Shutdown()
	})

	return &testServer{app: app, hub: hub, addr: addr}
}

// dialWS connects to the WebSocket endpoint without sending IDENTIFY.
func dialWS(t *testing.T, addr string) *websocket.Conn {
	t.Helper()

	url := fmt.Sprintf("ws://%s/ws", addr)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	require.NoError(t, err)

	t.Cleanup(func() {
		conn.Close()
	})

	return conn
}

// connectWS connects, sends IDENTIFY, and waits for READY.
func connectWS(t *testing.T, addr, token string) *websocket.Conn {
	t.Helper()

	conn := dialWS(t, addr)
	sendWSEvent(t, conn, ws.EventIdentify, map[string]string{"token": token})

	event := readWSEvent(t, conn, 2*time.Second)
	require.Equal(t, ws.EventReady, event.Type)

	return conn
}

func readWSEvent(t *testing.T, conn *websocket.Conn, timeout time.Duration) *ws.Event {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(timeout))
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err, "expected to read a WS event")

	var event ws.Event
	require.NoError(t, json.Unmarshal(msg, &event))
	return &event
}

func sendWSEvent(t *testing.T, conn *websocket.Conn, eventType string, data any) {
	t.Helper()

	event, err := ws.NewEvent(eventType, data)
	require.NoError(t, err)

	msg, err := json.Marshal(event)
	require.NoError(t, err)

	err = conn.WriteMessage(websocket.TextMessage, msg)
	require.NoError(t, err)
}

func expectNoWSEvent(t *testing.T, conn *websocket.Conn, timeout time.Duration) {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(timeout))
	_, _, err := conn.ReadMessage()
	assert.Error(t, err, "expected no WS event but received one")
}

func postMessage(t *testing.T, addr, token, channelID, content string) {
	t.Helper()

	url := fmt.Sprintf("http://%s/api/channels/%s/messages", addr, channelID)
	body, _ := json.Marshal(map[string]string{"content": content})
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)
}

func createUser(t *testing.T) *testutil.TestUser {
	t.Helper()
	u, err := testutil.CreateTestUser(context.Background(), testDB.Queries, jwksServer)
	require.NoError(t, err)
	return u
}

// --- Tests ---

func TestConnectAndIdentify(t *testing.T) {
	ts := startTestServer(t)
	user := createUser(t)

	conn := dialWS(t, ts.addr)
	sendWSEvent(t, conn, ws.EventIdentify, map[string]string{"token": user.AccessToken})

	event := readWSEvent(t, conn, 2*time.Second)
	assert.Equal(t, ws.EventReady, event.Type)

	var readyData ws.ReadyData
	require.NoError(t, json.Unmarshal(event.Data, &readyData))
	assert.Equal(t, user.User.ID.String(), readyData.UserID)
	assert.Equal(t, user.User.Username, readyData.Username)
	assert.NotNil(t, readyData.OnlineUserIDs)
}

func TestConnectWithoutIdentify(t *testing.T) {
	ts := startTestServer(t)

	conn := dialWS(t, ts.addr)

	// Send a non-IDENTIFY event first
	sendWSEvent(t, conn, ws.EventSubscribe, map[string]string{"channel_id": "some-channel"})

	// Server should close the connection
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err := conn.ReadMessage()
	assert.Error(t, err, "connection should be closed after non-IDENTIFY first message")
}

func TestConnectWithInvalidToken(t *testing.T) {
	ts := startTestServer(t)

	conn := dialWS(t, ts.addr)
	sendWSEvent(t, conn, ws.EventIdentify, map[string]string{"token": "invalid-jwt-token"})

	// Server should close the connection
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err := conn.ReadMessage()
	assert.Error(t, err, "connection should be closed after invalid token")
}

func TestMessageBroadcast(t *testing.T) {
	ts := startTestServer(t)
	user1 := createUser(t)
	user2 := createUser(t)

	// Create a server and channel
	server, channel, err := testutil.CreateTestServer(context.Background(), testDB.Queries, user1.User.ID)
	require.NoError(t, err)

	// Add user2 as a member
	require.NoError(t, testutil.AddTestMember(context.Background(), testDB.Queries, server.ID, user2.User.ID, "member"))

	// Both users connect via WS
	conn1 := connectWS(t, ts.addr, user1.AccessToken)
	conn2 := connectWS(t, ts.addr, user2.AccessToken)

	// Both subscribe to the channel
	sendWSEvent(t, conn1, ws.EventSubscribe, map[string]string{"channel_id": channel.ID.String()})
	sendWSEvent(t, conn2, ws.EventSubscribe, map[string]string{"channel_id": channel.ID.String()})

	// Small delay for subscriptions to process
	time.Sleep(100 * time.Millisecond)

	// User1 sends a message via HTTP
	postMessage(t, ts.addr, user1.AccessToken, channel.ID.String(), "Hello from user1!")

	// Both should receive MESSAGE_CREATE via WS
	event1 := readWSEvent(t, conn1, 2*time.Second)
	assert.Equal(t, ws.EventMessageCreate, event1.Type)

	var msgData1 map[string]interface{}
	require.NoError(t, json.Unmarshal(event1.Data, &msgData1))
	assert.Equal(t, "Hello from user1!", msgData1["content"])

	event2 := readWSEvent(t, conn2, 2*time.Second)
	assert.Equal(t, ws.EventMessageCreate, event2.Type)

	var msgData2 map[string]interface{}
	require.NoError(t, json.Unmarshal(event2.Data, &msgData2))
	assert.Equal(t, "Hello from user1!", msgData2["content"])
}

func TestTypingBroadcast(t *testing.T) {
	ts := startTestServer(t)
	user1 := createUser(t)
	user2 := createUser(t)

	server, channel, err := testutil.CreateTestServer(context.Background(), testDB.Queries, user1.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(context.Background(), testDB.Queries, server.ID, user2.User.ID, "member"))

	conn1 := connectWS(t, ts.addr, user1.AccessToken)
	conn2 := connectWS(t, ts.addr, user2.AccessToken)

	sendWSEvent(t, conn1, ws.EventSubscribe, map[string]string{"channel_id": channel.ID.String()})
	sendWSEvent(t, conn2, ws.EventSubscribe, map[string]string{"channel_id": channel.ID.String()})
	time.Sleep(100 * time.Millisecond)

	// User1 starts typing
	sendWSEvent(t, conn1, ws.EventTypingStart, map[string]string{"channel_id": channel.ID.String()})

	// User2 should receive the typing indicator
	event := readWSEvent(t, conn2, 2*time.Second)
	assert.Equal(t, ws.EventTypingStart, event.Type)

	var typingData map[string]string
	require.NoError(t, json.Unmarshal(event.Data, &typingData))
	assert.Equal(t, user1.User.ID.String(), typingData["user_id"])
	assert.Equal(t, user1.User.Username, typingData["username"])

	// User1 should NOT receive their own typing (sender excluded)
	expectNoWSEvent(t, conn1, 300*time.Millisecond)
}

func TestSubscribeUnsubscribe(t *testing.T) {
	ts := startTestServer(t)
	user1 := createUser(t)
	user2 := createUser(t)

	server, channel, err := testutil.CreateTestServer(context.Background(), testDB.Queries, user1.User.ID)
	require.NoError(t, err)
	require.NoError(t, testutil.AddTestMember(context.Background(), testDB.Queries, server.ID, user2.User.ID, "member"))

	conn1 := connectWS(t, ts.addr, user1.AccessToken)
	conn2 := connectWS(t, ts.addr, user2.AccessToken)

	// Both subscribe
	sendWSEvent(t, conn1, ws.EventSubscribe, map[string]string{"channel_id": channel.ID.String()})
	sendWSEvent(t, conn2, ws.EventSubscribe, map[string]string{"channel_id": channel.ID.String()})
	time.Sleep(100 * time.Millisecond)

	// User2 unsubscribes
	sendWSEvent(t, conn2, ws.EventUnsubscribe, map[string]string{"channel_id": channel.ID.String()})
	time.Sleep(100 * time.Millisecond)

	// Post a message
	postMessage(t, ts.addr, user1.AccessToken, channel.ID.String(), "After unsubscribe")

	// User1 should receive it
	event := readWSEvent(t, conn1, 2*time.Second)
	assert.Equal(t, ws.EventMessageCreate, event.Type)

	// User2 should NOT receive it
	expectNoWSEvent(t, conn2, 300*time.Millisecond)
}

func TestHeartbeatAck(t *testing.T) {
	ts := startTestServer(t)
	user := createUser(t)

	conn := connectWS(t, ts.addr, user.AccessToken)

	// Send HEARTBEAT
	sendWSEvent(t, conn, ws.EventHeartbeat, nil)

	// Should receive HEARTBEAT_ACK
	event := readWSEvent(t, conn, 2*time.Second)
	assert.Equal(t, ws.EventHeartbeatAck, event.Type)
}
