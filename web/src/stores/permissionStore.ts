import { create } from 'zustand'
import type { Role, ChannelPermissionOverride } from '../types/models'
import { hasPermission, parsePermissions } from '../types/permissions'
import { useServerStore } from './serverStore'
import { useAuthStore } from './authStore'

interface PermissionState {
  roles: Role[]
  memberRoleIds: Record<string, string[]> // userId -> roleId[]
  channelOverrides: Record<string, ChannelPermissionOverride[]> // channelId -> overrides

  setRoles: (roles: Role[]) => void
  addRole: (role: Role) => void
  updateRole: (role: Role) => void
  removeRole: (roleId: string) => void
  setMemberRoles: (userId: string, roleIds: string[]) => void
  addMemberRole: (userId: string, roleId: string) => void
  removeMemberRole: (userId: string, roleId: string) => void
  setChannelOverrides: (channelId: string, overrides: ChannelPermissionOverride[]) => void
  reset: () => void
}

export const usePermissionStore = create<PermissionState>((set) => ({
  roles: [],
  memberRoleIds: {},
  channelOverrides: {},

  setRoles: (roles) => set({ roles }),
  addRole: (role) => set((s) => ({
    roles: s.roles.some((r) => r.id === role.id) ? s.roles : [...s.roles, role]
  })),
  updateRole: (role) =>
    set((s) => ({
      roles: s.roles.map((r) => (r.id === role.id ? role : r)),
    })),
  removeRole: (roleId) =>
    set((s) => ({
      roles: s.roles.filter((r) => r.id !== roleId),
    })),

  setMemberRoles: (userId, roleIds) =>
    set((s) => ({
      memberRoleIds: { ...s.memberRoleIds, [userId]: roleIds },
    })),
  addMemberRole: (userId, roleId) =>
    set((s) => {
      const current = s.memberRoleIds[userId] || []
      if (current.includes(roleId)) return s
      return {
        memberRoleIds: { ...s.memberRoleIds, [userId]: [...current, roleId] },
      }
    }),
  removeMemberRole: (userId, roleId) =>
    set((s) => {
      const current = s.memberRoleIds[userId] || []
      return {
        memberRoleIds: {
          ...s.memberRoleIds,
          [userId]: current.filter((id) => id !== roleId),
        },
      }
    }),

  setChannelOverrides: (channelId, overrides) =>
    set((s) => ({
      channelOverrides: { ...s.channelOverrides, [channelId]: overrides },
    })),

  reset: () => set({ roles: [], memberRoleIds: {}, channelOverrides: {} }),
}))

// Compute effective server permissions for a user
export function computeServerPermissions(userId: string): bigint {
  const { roles, memberRoleIds } = usePermissionStore.getState()
  const server = useServerStore.getState()

  // Owner bypasses all
  const activeServer = server.servers.find((s) => s.id === server.activeServerId)
  if (activeServer?.owner_id === userId) {
    return BigInt('0x7FFFFFFFFFFFFFFF')
  }

  // Start with @everyone role
  const everyoneRole = roles.find((r) => r.position === 0 && r.name === '@everyone')
  let perms = everyoneRole ? parsePermissions(everyoneRole.permissions) : 0n

  // OR in member roles
  const userRoleIds = memberRoleIds[userId] || []
  for (const roleId of userRoleIds) {
    const role = roles.find((r) => r.id === roleId)
    if (role) {
      perms |= parsePermissions(role.permissions)
    }
  }

  return perms
}

// Compute effective channel permissions
export function computeChannelPermissions(userId: string, channelId: string): bigint {
  let perms = computeServerPermissions(userId)

  // Administrator bypasses channel overrides
  if (hasPermission(perms, 1n << 30n)) return perms

  const { roles, memberRoleIds, channelOverrides } = usePermissionStore.getState()
  const overrides = channelOverrides[channelId] || []
  if (overrides.length === 0) return perms

  // Get user's role IDs including @everyone
  const userRoleIds = new Set(memberRoleIds[userId] || [])
  const everyoneRole = roles.find((r) => r.position === 0 && r.name === '@everyone')
  if (everyoneRole) userRoleIds.add(everyoneRole.id)

  for (const override of overrides) {
    if (userRoleIds.has(override.role_id)) {
      perms &= ~parsePermissions(override.deny)
      perms |= parsePermissions(override.allow)
    }
  }

  return perms
}

// Quick helpers for current user
export function useHasPermission(perm: bigint): boolean {
  const roles = usePermissionStore((s) => s.roles)
  const memberRoleIds = usePermissionStore((s) => s.memberRoleIds)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const userId = useAuthStore((s) => s.user?.id ?? null)

  if (!userId) return false

  // No server context (e.g. DMs) — no permission restrictions
  if (!activeServerId) return true

  const activeServer = servers.find((s) => s.id === activeServerId)
  if (activeServer?.owner_id === userId) return true

  const everyoneRole = roles.find((r) => r.position === 0 && r.name === '@everyone')
  let perms = everyoneRole ? parsePermissions(everyoneRole.permissions) : 0n

  const userRoleIds = memberRoleIds[userId] || []
  for (const roleId of userRoleIds) {
    const role = roles.find((r) => r.id === roleId)
    if (role) perms |= parsePermissions(role.permissions)
  }

  return hasPermission(perms, perm)
}
