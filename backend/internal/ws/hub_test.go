package ws

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestClient(hub *Hub, userID uuid.UUID, username string) *Client {
	return &Client{
		Hub:      hub,
		UserID:   userID,
		Username: username,
		send:     make(chan []byte, sendBufferSize),
	}
}

func TestHub_RegisterUnregister(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	userID := uuid.New()
	client := newTestClient(hub, userID, "testuser")

	hub.Register(client)
	time.Sleep(10 * time.Millisecond) // Let hub process

	assert.True(t, hub.IsOnline(userID))

	hub.Unregister(client)
	time.Sleep(10 * time.Millisecond)

	assert.False(t, hub.IsOnline(userID))
}

func TestHub_SubscribeAndBroadcast(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	user1ID := uuid.New()
	user2ID := uuid.New()
	client1 := newTestClient(hub, user1ID, "user1")
	client2 := newTestClient(hub, user2ID, "user2")

	hub.Register(client1)
	hub.Register(client2)
	time.Sleep(10 * time.Millisecond)

	channelID := uuid.New().String()
	hub.Subscribe(user1ID, channelID)
	hub.Subscribe(user2ID, channelID)

	event, err := NewEvent(EventMessageCreate, map[string]string{
		"content": "hello",
	})
	require.NoError(t, err)

	hub.BroadcastToChannel(channelID, event, nil)

	// Both should receive the message
	select {
	case msg := <-client1.send:
		var e Event
		require.NoError(t, json.Unmarshal(msg, &e))
		assert.Equal(t, EventMessageCreate, e.Type)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("client1 did not receive message")
	}

	select {
	case msg := <-client2.send:
		var e Event
		require.NoError(t, json.Unmarshal(msg, &e))
		assert.Equal(t, EventMessageCreate, e.Type)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("client2 did not receive message")
	}
}

func TestHub_BroadcastExcludes(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	user1ID := uuid.New()
	user2ID := uuid.New()
	client1 := newTestClient(hub, user1ID, "user1")
	client2 := newTestClient(hub, user2ID, "user2")

	hub.Register(client1)
	hub.Register(client2)
	time.Sleep(10 * time.Millisecond)

	channelID := uuid.New().String()
	hub.Subscribe(user1ID, channelID)
	hub.Subscribe(user2ID, channelID)

	event, err := NewEvent(EventTypingStartBcast, map[string]string{
		"user_id": user1ID.String(),
	})
	require.NoError(t, err)

	// Broadcast but exclude user1
	hub.BroadcastToChannel(channelID, event, &user1ID)

	// user2 should receive
	select {
	case <-client2.send:
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Fatal("client2 did not receive message")
	}

	// user1 should NOT receive
	select {
	case <-client1.send:
		t.Fatal("client1 should not have received message")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}
}

func TestHub_Unsubscribe(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	userID := uuid.New()
	client := newTestClient(hub, userID, "testuser")

	hub.Register(client)
	time.Sleep(10 * time.Millisecond)

	channelID := uuid.New().String()
	hub.Subscribe(userID, channelID)
	hub.Unsubscribe(userID, channelID)

	event, err := NewEvent(EventMessageCreate, map[string]string{"content": "hello"})
	require.NoError(t, err)
	hub.BroadcastToChannel(channelID, event, nil)

	select {
	case <-client.send:
		t.Fatal("unsubscribed client should not receive message")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}
}

func TestHub_SendToUser(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	userID := uuid.New()
	client := newTestClient(hub, userID, "testuser")

	hub.Register(client)
	time.Sleep(10 * time.Millisecond)

	event, err := NewEvent(EventReady, map[string]string{"status": "ok"})
	require.NoError(t, err)

	hub.SendToUser(userID, event)

	select {
	case msg := <-client.send:
		var e Event
		require.NoError(t, json.Unmarshal(msg, &e))
		assert.Equal(t, EventReady, e.Type)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("client did not receive direct message")
	}
}

func TestHub_GetOnlineUsers(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	user1 := newTestClient(hub, uuid.New(), "user1")
	user2 := newTestClient(hub, uuid.New(), "user2")

	hub.Register(user1)
	hub.Register(user2)
	time.Sleep(10 * time.Millisecond)

	online := hub.GetOnlineUsers()
	assert.Len(t, online, 2)
}
