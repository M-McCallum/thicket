package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/google/uuid"
)

// MaxConnectionsPerUser is the maximum number of concurrent WebSocket connections per user.
const MaxConnectionsPerUser = 5

type Hub struct {
	clients      map[uuid.UUID][]*Client                // userID -> list of connections
	channels     map[string]map[uuid.UUID]bool           // channelID -> set of client userIDs
	voiceStates  map[string]map[uuid.UUID]VoiceState     // channelID -> userID -> state
	register     chan *Client
	unregister   chan *Client
	broadcast    chan *ChannelMessage
	mu           sync.RWMutex
	onConnect    func(userID uuid.UUID, username string)
	onDisconnect func(userID uuid.UUID, username string)
}

type VoiceState struct {
	UserID    uuid.UUID `json:"user_id"`
	ChannelID string    `json:"channel_id"`
	ServerID  string    `json:"server_id"`
	Username  string    `json:"username"`
	Muted     bool      `json:"muted"`
	Deafened  bool      `json:"deafened"`
}

type ChannelMessage struct {
	ChannelID string
	Event     *Event
	ExcludeID *uuid.UUID
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[uuid.UUID][]*Client),
		channels:    make(map[string]map[uuid.UUID]bool),
		voiceStates: make(map[string]map[uuid.UUID]VoiceState),
		register:    make(chan *Client, 256),
		unregister:  make(chan *Client, 256),
		broadcast:   make(chan *ChannelMessage, 256),
	}
}

func (h *Hub) SetOnConnect(fn func(userID uuid.UUID, username string)) {
	h.onConnect = fn
}

func (h *Hub) SetOnDisconnect(fn func(userID uuid.UUID, username string)) {
	h.onDisconnect = fn
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			conns := h.clients[client.UserID]

			// Enforce per-user connection limit: close oldest if at max
			if len(conns) >= MaxConnectionsPerUser {
				oldest := conns[0]
				close(oldest.send)
				conns = conns[1:]
				log.Printf("Evicted oldest connection for user %s (limit %d)", client.UserID, MaxConnectionsPerUser)
			}

			wasOffline := len(conns) == 0
			h.clients[client.UserID] = append(conns, client)
			h.mu.Unlock()
			log.Printf("Client registered: %s (%s)", client.Username, client.UserID)
			if wasOffline && h.onConnect != nil {
				go h.onConnect(client.UserID, client.Username)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			conns := h.clients[client.UserID]
			// Remove this specific client from the slice
			for i, c := range conns {
				if c == client {
					close(c.send)
					conns = append(conns[:i], conns[i+1:]...)
					break
				}
			}

			nowOffline := len(conns) == 0
			if nowOffline {
				delete(h.clients, client.UserID)

				// Remove from all channels
				for chID, members := range h.channels {
					delete(members, client.UserID)
					if len(members) == 0 {
						delete(h.channels, chID)
					}
				}

				// Remove from voice channels
				for chID, users := range h.voiceStates {
					if _, inVoice := users[client.UserID]; inVoice {
						delete(users, client.UserID)
						if len(users) == 0 {
							delete(h.voiceStates, chID)
						}
					}
				}
			} else {
				h.clients[client.UserID] = conns
			}
			h.mu.Unlock()
			log.Printf("Client unregistered: %s (%s)", client.Username, client.UserID)
			if nowOffline && h.onDisconnect != nil {
				go h.onDisconnect(client.UserID, client.Username)
			}

		case msg := <-h.broadcast:
			h.mu.RLock()
			if subscribers, ok := h.channels[msg.ChannelID]; ok {
				data, err := json.Marshal(msg.Event)
				if err != nil {
					h.mu.RUnlock()
					continue
				}
				for userID := range subscribers {
					if msg.ExcludeID != nil && userID == *msg.ExcludeID {
						continue
					}
					for _, client := range h.clients[userID] {
						select {
						case client.send <- data:
						default:
							// Client buffer full, skip
						}
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Subscribe(userID uuid.UUID, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.channels[channelID] == nil {
		h.channels[channelID] = make(map[uuid.UUID]bool)
	}
	h.channels[channelID][userID] = true
}

func (h *Hub) Unsubscribe(userID uuid.UUID, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if members, ok := h.channels[channelID]; ok {
		delete(members, userID)
		if len(members) == 0 {
			delete(h.channels, channelID)
		}
	}
}

func (h *Hub) BroadcastToChannel(channelID string, event *Event, excludeID *uuid.UUID) {
	h.broadcast <- &ChannelMessage{
		ChannelID: channelID,
		Event:     event,
		ExcludeID: excludeID,
	}
}

func (h *Hub) SendToUser(userID uuid.UUID, event *Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	conns, ok := h.clients[userID]
	if !ok {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	for _, client := range conns {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (h *Hub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	conns := h.clients[userID]
	return len(conns) > 0
}

func (h *Hub) GetOnlineUsers() []uuid.UUID {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users := make([]uuid.UUID, 0, len(h.clients))
	for id := range h.clients {
		users = append(users, id)
	}
	return users
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

func (h *Hub) JoinVoiceChannel(state VoiceState) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Leave any existing voice channel first
	for chID, users := range h.voiceStates {
		if _, ok := users[state.UserID]; ok {
			delete(users, state.UserID)
			if len(users) == 0 {
				delete(h.voiceStates, chID)
			}
		}
	}

	if h.voiceStates[state.ChannelID] == nil {
		h.voiceStates[state.ChannelID] = make(map[uuid.UUID]VoiceState)
	}
	h.voiceStates[state.ChannelID][state.UserID] = state
}

func (h *Hub) LeaveVoiceChannel(userID uuid.UUID, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if users, ok := h.voiceStates[channelID]; ok {
		delete(users, userID)
		if len(users) == 0 {
			delete(h.voiceStates, channelID)
		}
	}
}

func (h *Hub) IsSubscribed(userID uuid.UUID, channelID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	subs, ok := h.channels[channelID]
	if !ok {
		return false
	}
	return subs[userID]
}

func (h *Hub) GetVoiceParticipants(channelID string) []VoiceState {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users, ok := h.voiceStates[channelID]
	if !ok {
		return nil
	}

	states := make([]VoiceState, 0, len(users))
	for _, s := range users {
		states = append(states, s)
	}
	return states
}
