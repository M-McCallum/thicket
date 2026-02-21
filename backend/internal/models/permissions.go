package models

// Permission bitmask constants.
const (
	PermViewChannels   int64 = 1 << 0
	PermSendMessages   int64 = 1 << 1
	PermManageMessages int64 = 1 << 2
	PermManageChannels int64 = 1 << 3
	PermManageRoles    int64 = 1 << 4
	PermKickMembers    int64 = 1 << 5
	PermBanMembers     int64 = 1 << 6
	PermManageServer   int64 = 1 << 7
	PermAddReactions   int64 = 1 << 8
	PermAttachFiles    int64 = 1 << 9
	PermPinMessages    int64 = 1 << 12
	PermVoiceConnect   int64 = 1 << 13
	PermVoiceSpeak     int64 = 1 << 14
	PermAdministrator  int64 = 1 << 30
)

// PermAllDefault is the default permission set for @everyone.
var PermAllDefault int64 = PermViewChannels | PermSendMessages | PermAddReactions | PermAttachFiles | PermVoiceConnect | PermVoiceSpeak

// HasPermission checks if `perms` includes `check`. Administrator bypasses all.
func HasPermission(perms, check int64) bool {
	if perms&PermAdministrator != 0 {
		return true
	}
	return perms&check == check
}
