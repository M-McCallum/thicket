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
	EventTokenRefresh   = "TOKEN_REFRESH"
	EventVoiceJoin      = "VOICE_JOIN"
	EventVoiceLeave     = "VOICE_LEAVE"
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
	EventDMMessageCreate    = "DM_MESSAGE_CREATE"
	EventUserProfileUpdate  = "USER_PROFILE_UPDATE"
	EventSessionExpired     = "SESSION_EXPIRED"
)

type Event struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

type IdentifyData struct {
	Token string `json:"token"`
}

type TokenRefreshData struct {
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

type ReadyData struct {
	UserID        string   `json:"user_id"`
	Username      string   `json:"username"`
	OnlineUserIDs []string `json:"online_user_ids"`
}

type VoiceJoinData struct {
	ChannelID string `json:"channel_id"`
	ServerID  string `json:"server_id"`
}

type VoiceLeaveData struct {
	ChannelID string `json:"channel_id"`
	ServerID  string `json:"server_id"`
}

type VoiceStateData struct {
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	ChannelID string `json:"channel_id"`
	ServerID  string `json:"server_id"`
	Joined    bool   `json:"joined"`
	Muted     bool   `json:"muted"`
	Deafened  bool   `json:"deafened"`
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
