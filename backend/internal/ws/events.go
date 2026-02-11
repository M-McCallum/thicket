package ws

import "encoding/json"

// Client → Server event types
const (
	EventIdentify       = "IDENTIFY"
	EventHeartbeat      = "HEARTBEAT"
	EventSubscribe      = "SUBSCRIBE"
	EventUnsubscribe    = "UNSUBSCRIBE"
	EventTypingStart    = "TYPING_START"
	EventPresenceUpdate = "PRESENCE_UPDATE"
)

// Server → Client event types
const (
	EventReady            = "READY"
	EventHeartbeatAck     = "HEARTBEAT_ACK"
	EventMessageCreate    = "MESSAGE_CREATE"
	EventMessageUpdate    = "MESSAGE_UPDATE"
	EventMessageDelete    = "MESSAGE_DELETE"
	EventTypingStartBcast = "TYPING_START"
	EventPresenceUpdBcast = "PRESENCE_UPDATE"
	EventChannelCreate    = "CHANNEL_CREATE"
	EventChannelUpdate    = "CHANNEL_UPDATE"
	EventChannelDelete    = "CHANNEL_DELETE"
	EventMemberJoin       = "MEMBER_JOIN"
	EventMemberLeave      = "MEMBER_LEAVE"
	EventVoiceStateUpdate = "VOICE_STATE_UPDATE"
	EventDMMessageCreate  = "DM_MESSAGE_CREATE"
)

type Event struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

type IdentifyData struct {
	Token string `json:"token"`
}

type SubscribeData struct {
	ChannelID string `json:"channel_id"`
}

type TypingData struct {
	ChannelID string `json:"channel_id"`
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
}

type PresenceData struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Status   string `json:"status"`
}

func NewEvent(eventType string, data any) (*Event, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	return &Event{
		Type: eventType,
		Data: raw,
	}, nil
}
