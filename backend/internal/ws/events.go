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
	EventDMCallStart    = "DM_CALL_START"
	EventDMCallAccept   = "DM_CALL_ACCEPT"
	EventDMCallEnd      = "DM_CALL_END"
)

// Server → Client event types
const (
	EventReady              = "READY"
	EventHeartbeatAck       = "HEARTBEAT_ACK"
	EventMessageCreate      = "MESSAGE_CREATE"
	EventMessageUpdate      = "MESSAGE_UPDATE"
	EventMessageDelete      = "MESSAGE_DELETE"
	EventTypingStartBcast   = "TYPING_START"
	EventPresenceUpdBcast   = "PRESENCE_UPDATE"
	EventChannelCreate      = "CHANNEL_CREATE"
	EventChannelUpdate      = "CHANNEL_UPDATE"
	EventChannelDelete      = "CHANNEL_DELETE"
	EventMemberJoin         = "MEMBER_JOIN"
	EventMemberLeave        = "MEMBER_LEAVE"
	EventVoiceStateUpdate   = "VOICE_STATE_UPDATE"
	EventDMMessageCreate    = "DM_MESSAGE_CREATE"
	EventUserProfileUpdate  = "USER_PROFILE_UPDATE"
	EventSessionExpired     = "SESSION_EXPIRED"
	EventFriendRequestCreate = "FRIEND_REQUEST_CREATE"
	EventFriendRequestAccept = "FRIEND_REQUEST_ACCEPT"
	EventFriendRemove        = "FRIEND_REMOVE"
	EventDMCallRing          = "DM_CALL_RING"
	EventDMCallAcceptBcast   = "DM_CALL_ACCEPT"
	EventDMCallEndBcast      = "DM_CALL_END"
	EventServerUpdate        = "SERVER_UPDATE"
	EventMemberUpdate        = "MEMBER_UPDATE"
	EventCategoryCreate      = "CATEGORY_CREATE"
	EventCategoryUpdate      = "CATEGORY_UPDATE"
	EventCategoryDelete      = "CATEGORY_DELETE"
	EventMessagePin          = "MESSAGE_PIN"
	EventMessageUnpin        = "MESSAGE_UNPIN"
	EventReactionAdd         = "REACTION_ADD"
	EventReactionRemove      = "REACTION_REMOVE"
	EventRoleCreate          = "ROLE_CREATE"
	EventRoleUpdate          = "ROLE_UPDATE"
	EventRoleDelete          = "ROLE_DELETE"
	EventMemberRoleUpdate    = "MEMBER_ROLE_UPDATE"
	EventMemberBan           = "MEMBER_BAN"
	EventMemberTimeout       = "MEMBER_TIMEOUT"
	EventThreadCreate        = "THREAD_CREATE"
	EventThreadUpdate        = "THREAD_UPDATE"
	EventThreadMessageCreate = "THREAD_MESSAGE_CREATE"
	EventThreadMessageDelete = "THREAD_MESSAGE_DELETE"
	EventPollCreate          = "POLL_CREATE"
	EventPollVote            = "POLL_VOTE"
	EventMentionCreate        = "MENTION_CREATE"
	EventUnreadUpdate         = "UNREAD_UPDATE"
	EventDMParticipantAdd     = "DM_PARTICIPANT_ADD"
	EventDMParticipantRemove  = "DM_PARTICIPANT_REMOVE"
	EventDMConversationUpdate = "DM_CONVERSATION_UPDATE"
	EventDMMessageUpdate      = "DM_MESSAGE_UPDATE"
	EventDMMessageDelete      = "DM_MESSAGE_DELETE"
	EventDMReactionAdd        = "DM_REACTION_ADD"
	EventDMReactionRemove     = "DM_REACTION_REMOVE"
	EventDMMessagePin         = "DM_MESSAGE_PIN"
	EventDMMessageUnpin       = "DM_MESSAGE_UNPIN"
	EventNotification         = "NOTIFICATION"
	EventStageStart          = "STAGE_START"
	EventStageEnd            = "STAGE_END"
	EventStageSpeakerAdd     = "STAGE_SPEAKER_ADD"
	EventStageSpeakerRemove  = "STAGE_SPEAKER_REMOVE"
	EventStageHandRaise      = "STAGE_HAND_RAISE"
	EventStageHandLower      = "STAGE_HAND_LOWER"
	EventForumPostDelete     = "FORUM_POST_DELETE"
	EventForumPostMessageCreate = "FORUM_POST_MESSAGE_CREATE"
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
	UserID         string              `json:"user_id"`
	Username       string              `json:"username"`
	OnlineUserIDs  []string            `json:"online_user_ids"`
	UnreadCounts   []UnreadCountData   `json:"unread_counts"`
	DMUnreadCounts []DMUnreadCountData `json:"dm_unread_counts"`
}

type UnreadCountData struct {
	ChannelID    string `json:"channel_id"`
	UnreadCount  int    `json:"unread_count"`
	MentionCount int    `json:"mention_count"`
}

type DMUnreadCountData struct {
	ConversationID string `json:"conversation_id"`
	UnreadCount    int    `json:"unread_count"`
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

type DMCallData struct {
	ConversationID string `json:"conversation_id"`
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
