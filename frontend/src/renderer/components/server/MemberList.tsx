import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useServerStore } from '@renderer/stores/serverStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { usePermissionStore } from '@renderer/stores/permissionStore'
import UserProfilePopup from '@renderer/components/profile/UserProfilePopup'
import UserAvatar from '@renderer/components/common/UserAvatar'
import ModerationActionModal from '@renderer/components/server/ModerationActionModal'
import { moderation } from '@renderer/services/api'

const statusColors: Record<string, string> = {
  online: 'bg-sol-green',
  idle: 'bg-sol-amber',
  dnd: 'bg-sol-coral',
  offline: 'bg-sol-text-muted'
}

// Permission bitmask constants (mirrored from backend)
const PermKickMembers = 1 << 5
const PermBanMembers = 1 << 6
const PermAdministrator = 1 << 30

export default function MemberList() {
  const { members } = useServerStore()
  const activeServerId = useServerStore((s) => s.activeServerId)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const roles = usePermissionStore((s) => s.roles)
  const memberRoleIds = usePermissionStore((s) => s.memberRoleIds)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [preloadedData, setPreloadedData] = useState<{ display_name?: string | null; username?: string; status?: string } | undefined>()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; memberId: string; username: string } | null>(null)
  const [modAction, setModAction] = useState<{ action: 'kick' | 'ban' | 'timeout'; userId: string; username: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Compute current user's permissions
  const myPermissions = useMemo(() => {
    if (!currentUserId) return 0
    const myRoleIds = memberRoleIds[currentUserId] || []
    let perms = 0
    // Get @everyone role permissions
    const everyoneRole = roles.find((r) => r.name === '@everyone')
    if (everyoneRole) perms |= Number(everyoneRole.permissions)
    // OR in member-specific roles
    for (const roleId of myRoleIds) {
      const role = roles.find((r) => r.id === roleId)
      if (role) perms |= Number(role.permissions)
    }
    // Check if current user is server owner
    const servers = useServerStore.getState().servers
    const activeServer = servers.find((s) => s.id === activeServerId)
    if (activeServer && activeServer.owner_id === currentUserId) {
      perms |= PermAdministrator
    }
    return perms
  }, [currentUserId, memberRoleIds, roles, activeServerId])

  const canKick = (myPermissions & PermAdministrator) !== 0 || (myPermissions & PermKickMembers) !== 0
  const canBan = (myPermissions & PermAdministrator) !== 0 || (myPermissions & PermBanMembers) !== 0

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  // Get hoisted roles sorted by position desc (highest first)
  const hoistedRoles = useMemo(
    () => roles.filter((r) => r.hoist && r.name !== '@everyone').sort((a, b) => b.position - a.position),
    [roles]
  )

  // Get highest hoisted role for a member
  const getMemberHighestRole = (memberId: string) => {
    const ids = memberRoleIds[memberId] || []
    let highest: typeof roles[0] | null = null
    for (const roleId of ids) {
      const role = roles.find((r) => r.id === roleId)
      if (role?.hoist && (!highest || role.position > highest.position)) {
        highest = role
      }
    }
    return highest
  }

  // Get the display color for a member based on their highest role
  const getMemberColor = (memberId: string): string | null => {
    const ids = memberRoleIds[memberId] || []
    let highest: typeof roles[0] | null = null
    for (const roleId of ids) {
      const role = roles.find((r) => r.id === roleId)
      if (role?.color && (!highest || role.position > highest.position)) {
        highest = role
      }
    }
    return highest?.color || null
  }

  // Group members by hoisted roles
  const grouped = useMemo(() => {
    const onlineMembers = members.filter((m) => m.status !== 'offline')
    const offlineMembers = members.filter((m) => m.status === 'offline')

    if (hoistedRoles.length === 0) {
      return { sections: [{ label: `Online — ${onlineMembers.length}`, members: onlineMembers }], offline: offlineMembers }
    }

    const sections: { label: string; members: typeof members }[] = []
    const placed = new Set<string>()

    for (const role of hoistedRoles) {
      const roleMembers = onlineMembers.filter((m) => {
        if (placed.has(m.id)) return false
        return getMemberHighestRole(m.id)?.id === role.id
      })
      if (roleMembers.length > 0) {
        sections.push({ label: `${role.name} — ${roleMembers.length}`, members: roleMembers })
        roleMembers.forEach((m) => placed.add(m.id))
      }
    }

    const remaining = onlineMembers.filter((m) => !placed.has(m.id))
    if (remaining.length > 0) {
      sections.push({ label: `Online — ${remaining.length}`, members: remaining })
    }

    return { sections, offline: offlineMembers }
  }, [members, hoistedRoles, memberRoleIds])

  const handleMemberClick = (member: { id: string; username: string; display_name: string | null; status: string }) => {
    if (member.id === currentUserId) return
    setPreloadedData({ display_name: member.display_name, username: member.username, status: member.status })
    setSelectedUserId(member.id)
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, member: { id: string; username: string }) => {
    if (member.id === currentUserId) return
    if (!canKick && !canBan) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, memberId: member.id, username: member.username })
  }, [currentUserId, canKick, canBan])

  const handleModAction = async (reason: string, duration?: number) => {
    if (!modAction || !activeServerId) return
    const { action, userId } = modAction
    if (action === 'kick') {
      await moderation.kick(activeServerId, userId, reason)
    } else if (action === 'ban') {
      await moderation.ban(activeServerId, userId, reason)
    } else if (action === 'timeout' && duration) {
      await moderation.timeout(activeServerId, userId, duration, reason)
    }
  }

  // Check if target is owner (cannot moderate owner)
  const isOwner = useCallback((userId: string) => {
    const servers = useServerStore.getState().servers
    const activeServer = servers.find((s) => s.id === activeServerId)
    return activeServer?.owner_id === userId
  }, [activeServerId])

  return (
    <aside className="w-60 max-w-[80vw] bg-sol-bg-secondary border-l border-sol-bg-elevated flex flex-col" aria-label="Members">
      <div className="flex-1 overflow-y-auto py-2" role="list">
        {grouped.sections.map((section) => (
          <div key={section.label} className="mb-2">
            <div className="px-3 py-1 text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              {section.label}
            </div>
            {section.members.map((member) => (
              <MemberItem
                key={member.id}
                member={member}
                color={getMemberColor(member.id)}
                onClick={() => handleMemberClick(member)}
                onContextMenu={(e) => handleContextMenu(e, member)}
              />
            ))}
          </div>
        ))}

        {grouped.offline.length > 0 && (
          <div>
            <div className="px-3 py-1 text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Offline — {grouped.offline.length}
            </div>
            {grouped.offline.map((member) => (
              <MemberItem
                key={member.id}
                member={member}
                color={getMemberColor(member.id)}
                onClick={() => handleMemberClick(member)}
                onContextMenu={(e) => handleContextMenu(e, member)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedUserId && (
        <UserProfilePopup
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          preloaded={preloadedData}
        />
      )}

      {/* Context menu */}
      {contextMenu && !isOwner(contextMenu.memberId) && (
        <div
          ref={contextMenuRef}
          className="fixed bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg shadow-xl py-1 z-[70] min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {canKick && (
            <button
              onClick={() => {
                setModAction({ action: 'kick', userId: contextMenu.memberId, username: contextMenu.username })
                setContextMenu(null)
              }}
              className="w-full text-left px-4 py-2 text-sm text-sol-text-primary hover:bg-sol-bg-elevated/50 transition-colors"
            >
              Kick {contextMenu.username}
            </button>
          )}
          {canBan && (
            <button
              onClick={() => {
                setModAction({ action: 'ban', userId: contextMenu.memberId, username: contextMenu.username })
                setContextMenu(null)
              }}
              className="w-full text-left px-4 py-2 text-sm text-sol-coral hover:bg-sol-bg-elevated/50 transition-colors"
            >
              Ban {contextMenu.username}
            </button>
          )}
          {canKick && (
            <button
              onClick={() => {
                setModAction({ action: 'timeout', userId: contextMenu.memberId, username: contextMenu.username })
                setContextMenu(null)
              }}
              className="w-full text-left px-4 py-2 text-sm text-sol-amber hover:bg-sol-bg-elevated/50 transition-colors"
            >
              Timeout {contextMenu.username}
            </button>
          )}
        </div>
      )}

      {/* Moderation action modal */}
      {modAction && (
        <ModerationActionModal
          action={modAction.action}
          username={modAction.username}
          onConfirm={handleModAction}
          onClose={() => setModAction(null)}
        />
      )}
    </aside>
  )
}

function MemberItem({ member, color, onClick, onContextMenu }: {
  member: { id: string; username: string; display_name: string | null; avatar_url: string | null; status: string; role: string }
  color: string | null
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const fallbackColors: Record<string, string> = {
    owner: 'text-sol-amber',
    admin: 'text-sol-rose',
    member: 'text-sol-text-primary'
  }

  return (
    <div
      role="listitem"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex items-center gap-2 px-3 py-1.5 hover:bg-sol-bg-elevated/50 transition-colors cursor-pointer rounded-lg"
    >
      <div className="relative">
        <UserAvatar avatarUrl={member.avatar_url} username={member.display_name ?? member.username} size="sm" />
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-sol-bg-secondary ${statusColors[member.status] ?? statusColors.offline}`}
        />
      </div>
      <span
        className={`text-sm truncate ${!color ? (fallbackColors[member.role] ?? fallbackColors.member) : ''}`}
        style={color ? { color } : undefined}
      >
        {member.display_name ?? member.username}
      </span>
    </div>
  )
}
