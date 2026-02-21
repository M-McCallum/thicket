import { useState, useEffect, useCallback } from 'react'
import { usePermissionStore } from '@/stores/permissionStore'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import { roles as rolesApi } from '@/services/api'

type Tier = 'owner' | 'admin' | 'member'

export default function RoleSettingsPanel() {
  const roles = usePermissionStore((s) => s.roles)
  const memberRoleIds = usePermissionStore((s) => s.memberRoleIds)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const members = useServerStore((s) => s.members)
  const currentUserId = useAuthStore((s) => s.user?.id)

  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const activeServer = servers.find((s) => s.id === activeServerId)
  const isOwner = activeServer?.owner_id === currentUserId

  // Find the Admin role (position > 0, not @everyone)
  const adminRole = roles.find((r) => r.position > 0 && r.name !== '@everyone')

  const getMemberTier = useCallback(
    (memberId: string): Tier => {
      if (activeServer?.owner_id === memberId) return 'owner'
      if (adminRole && (memberRoleIds[memberId] || []).includes(adminRole.id)) return 'admin'
      return 'member'
    },
    [activeServer?.owner_id, adminRole, memberRoleIds]
  )

  // Sort: owner first, then admins, then members
  const sortedMembers = [...members].sort((a, b) => {
    const tierOrder: Record<Tier, number> = { owner: 0, admin: 1, member: 2 }
    const ta = tierOrder[getMemberTier(a.id)]
    const tb = tierOrder[getMemberTier(b.id)]
    if (ta !== tb) return ta - tb
    return (a.display_name ?? a.username).localeCompare(b.display_name ?? b.username)
  })

  const handleToggle = async (memberId: string, currentTier: Tier) => {
    if (!activeServerId || !adminRole || loading) return
    setLoading(memberId)
    setError('')
    try {
      if (currentTier === 'member') {
        await rolesApi.assign(activeServerId, memberId, adminRole.id)
        usePermissionStore.getState().addMemberRole(memberId, adminRole.id)
      } else if (currentTier === 'admin') {
        await rolesApi.remove(activeServerId, memberId, adminRole.id)
        usePermissionStore.getState().removeMemberRole(memberId, adminRole.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setLoading(null)
    }
  }

  const tierLabel: Record<Tier, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }
  const tierColor: Record<Tier, string> = {
    owner: 'text-sol-amber',
    admin: 'text-sol-rose',
    member: 'text-sol-text-secondary',
  }
  const tierBadgeBg: Record<Tier, string> = {
    owner: 'bg-sol-amber/15 text-sol-amber',
    admin: 'bg-sol-rose/15 text-sol-rose',
    member: 'bg-sol-bg-elevated text-sol-text-secondary',
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-sol-text-primary">Members</h3>
        <p className="text-sm text-sol-text-muted mt-1">
          Manage member roles. Admins can invite, edit settings, create channels, and manage members.
        </p>
      </div>

      {error && <p className="text-sm text-sol-coral">{error}</p>}

      <div className="space-y-1">
        {sortedMembers.map((member) => {
          const tier = getMemberTier(member.id)
          const isLoading = loading === member.id
          const isSelf = member.id === currentUserId

          return (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sol-bg-elevated/50 transition-colors"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-sol-bg-elevated flex items-center justify-center text-sm font-medium shrink-0">
                {(member.display_name ?? member.username).charAt(0).toUpperCase()}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium truncate block ${tierColor[tier]}`}>
                  {member.display_name ?? member.username}
                </span>
                <span className="text-xs text-sol-text-muted truncate block">
                  {member.username}
                </span>
              </div>

              {/* Badge */}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${tierBadgeBg[tier]}`}>
                {tierLabel[tier]}
              </span>

              {/* Promote/Demote button (only owner can toggle, not for self or other owner) */}
              {isOwner && tier !== 'owner' && !isSelf && (
                <button
                  onClick={() => handleToggle(member.id, tier)}
                  disabled={isLoading}
                  className={`text-xs px-3 py-1 rounded-md transition-colors shrink-0 disabled:opacity-50 ${
                    tier === 'admin'
                      ? 'bg-sol-bg-elevated text-sol-text-secondary hover:bg-sol-bg-elevated/80'
                      : 'bg-sol-amber/15 text-sol-amber hover:bg-sol-amber/25'
                  }`}
                >
                  {isLoading
                    ? '...'
                    : tier === 'admin'
                      ? 'Demote'
                      : 'Promote'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
