package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/google/uuid"
)

type Hub struct {
	clients    map[uuid.UUID]*Client
	channels   map[string]map[uuid.UUID]bool // channelID -> set of client userIDs
	register   chan *Client
	unregister chan *Client
	broadcast  chan *ChannelMessage
	mu         sync.RWMutex
}

type ChannelMessage struct {
	ChannelID string
	Event     *Event
	ExcludeID *uuid.UUID
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[uuid.UUID]*Client),
		channels:   make(map[string]map[uuid.UUID]bool),
		register:   make(chan *Client, 256),
		unregister: make(chan *Client, 256),
		broadcast:  make(chan *ChannelMessage, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.UserID] = client
			h.mu.Unlock()
			log.Printf("Client registered: %s (%s)", client.Username, client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.UserID]; ok {
				delete(h.clients, client.UserID)
				close(client.send)

				// Remove from all channels
				for chID, members := range h.channels {
					delete(members, client.UserID)
					if len(members) == 0 {
						delete(h.channels, chID)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("Client unregistered: %s (%s)", client.Username, client.UserID)

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
					if client, ok := h.clients[userID]; ok {
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

	client, ok := h.clients[userID]
	if !ok {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	select {
	case client.send <- data:
	default:
	}
}

func (h *Hub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.clients[userID]
	return ok
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
