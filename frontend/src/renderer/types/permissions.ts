// Permission bitmask constants — mirrors backend models/permissions.go
// Using BigInt because these are int64 values serialized as strings

export const PermViewChannels   = 1n << 0n
export const PermSendMessages   = 1n << 1n
export const PermManageMessages = 1n << 2n
export const PermManageChannels = 1n << 3n
export const PermManageRoles    = 1n << 4n
export const PermKickMembers    = 1n << 5n
export const PermBanMembers     = 1n << 6n
export const PermManageServer   = 1n << 7n
export const PermAddReactions   = 1n << 8n
export const PermAttachFiles    = 1n << 9n
export const PermPinMessages    = 1n << 12n
export const PermVoiceConnect   = 1n << 13n
export const PermVoiceSpeak     = 1n << 14n
export const PermAdministrator  = 1n << 30n

export function hasPermission(perms: bigint, check: bigint): boolean {
  if ((perms & PermAdministrator) !== 0n) return true
  return (perms & check) === check
}

export function parsePermissions(s: string | undefined | null): bigint {
  if (!s) return 0n
  try {
    return BigInt(s)
  } catch {
    return 0n
  }
}

export const PERMISSION_LABELS: { perm: bigint; name: string; description: string; category: string }[] = [
  { perm: PermViewChannels, name: 'View Channels', description: 'Allows members to view channels', category: 'General' },
  { perm: PermSendMessages, name: 'Send Messages', description: 'Allows members to send messages in text channels', category: 'Text' },
  { perm: PermManageMessages, name: 'Manage Messages', description: 'Allows deleting messages from other members', category: 'Text' },
  { perm: PermAddReactions, name: 'Add Reactions', description: 'Allows adding reactions to messages', category: 'Text' },
  { perm: PermAttachFiles, name: 'Attach Files', description: 'Allows uploading files and images', category: 'Text' },
  { perm: PermPinMessages, name: 'Pin Messages', description: 'Allows pinning messages in a channel', category: 'Text' },
  { perm: PermManageChannels, name: 'Manage Channels', description: 'Allows creating, editing, and deleting channels', category: 'Management' },
  { perm: PermManageRoles, name: 'Manage Roles', description: 'Allows creating and editing roles below their highest role', category: 'Management' },
  { perm: PermManageServer, name: 'Manage Server', description: 'Allows editing server name, icon, and settings', category: 'Management' },
  { perm: PermKickMembers, name: 'Kick Members', description: 'Allows removing members from the server', category: 'Moderation' },
  { perm: PermBanMembers, name: 'Ban Members', description: 'Allows permanently banning members', category: 'Moderation' },
  { perm: PermVoiceConnect, name: 'Connect', description: 'Allows joining voice channels', category: 'Voice' },
  { perm: PermVoiceSpeak, name: 'Speak', description: 'Allows speaking in voice channels', category: 'Voice' },
  { perm: PermAdministrator, name: 'Administrator', description: 'Full access to all permissions. Use with caution.', category: 'Dangerous' },
]
