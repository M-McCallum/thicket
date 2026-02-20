package ws

import "github.com/google/uuid"

// BroadcastToServerMembers sends an event to each member by user ID,
// optionally excluding one user (e.g. the sender).
func BroadcastToServerMembers(hub *Hub, memberIDs []uuid.UUID, event *Event, excludeID *uuid.UUID) {
	for _, id := range memberIDs {
		if excludeID != nil && id == *excludeID {
			continue
		}
		hub.SendToUser(id, event)
	}
}
