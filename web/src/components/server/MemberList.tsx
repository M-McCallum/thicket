import { useState, useMemo } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import { usePermissionStore } from '@/stores/permissionStore'
import UserProfilePopup from '@/components/profile/UserProfilePopup'

const statusColors: Record<string, string> = {
  online: 'bg-sol-green',
  idle: 'bg-sol-amber',
  dnd: 'bg-sol-coral',
  offline: 'bg-sol-text-muted'
}

export default function MemberList() {
  const { members } = useServerStore()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const roles = usePermissionStore((s) => s.roles)
  const memberRoleIds = usePermissionStore((s) => s.memberRoleIds)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [preloadedData, setPreloadedData] = useState<{ display_name?: string | null; username?: string; status?: string } | undefined>()

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

  return (
    <div className="w-60 bg-sol-bg-secondary border-l border-sol-bg-elevated flex flex-col">
      <div className="flex-1 overflow-y-auto py-2">
        {grouped.sections.map((section) => (
          <div key={section.label} className="mb-2">
            <div className="px-3 py-1 text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              {section.label}
            </div>
            {section.members.map((member) => (
              <MemberItem key={member.id} member={member} color={getMemberColor(member.id)} onClick={() => handleMemberClick(member)} />
            ))}
          </div>
        ))}

        {grouped.offline.length > 0 && (
          <div>
            <div className="px-3 py-1 text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Offline — {grouped.offline.length}
            </div>
            {grouped.offline.map((member) => (
              <MemberItem key={member.id} member={member} color={getMemberColor(member.id)} onClick={() => handleMemberClick(member)} />
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
    </div>
  )
}

function MemberItem({ member, color, onClick }: { member: { id: string; username: string; display_name: string | null; status: string; role: string }; color: string | null; onClick: () => void }) {
  const fallbackColors: Record<string, string> = {
    owner: 'text-sol-amber',
    admin: 'text-sol-rose',
    member: 'text-sol-text-primary'
  }

  return (
    <div onClick={onClick} className="flex items-center gap-2 px-3 py-1.5 hover:bg-sol-bg-elevated/50 transition-colors cursor-pointer rounded-lg">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex items-center justify-center text-sm font-medium">
          {(member.display_name ?? member.username).charAt(0).toUpperCase()}
        </div>
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
