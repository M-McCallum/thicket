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
