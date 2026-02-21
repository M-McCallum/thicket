import { useState } from 'react'
import { roles } from '@/services/api'
import { usePermissionStore } from '@/stores/permissionStore'
import { useServerStore } from '@/stores/serverStore'

const emptyArray: string[] = []

interface MemberRoleManagerProps {
  memberId: string
  onClose: () => void
}

export default function MemberRoleManager({ memberId, onClose }: MemberRoleManagerProps) {
  const serverId = useServerStore((s) => s.activeServerId)
  const allRoles = usePermissionStore((s) => s.roles)
  const allMemberRoleIds = usePermissionStore((s) => s.memberRoleIds)
  const memberRoleIds = allMemberRoleIds[memberId] ?? emptyArray
  const addMemberRole = usePermissionStore((s) => s.addMemberRole)
  const removeMemberRole = usePermissionStore((s) => s.removeMemberRole)
  const [loading, setLoading] = useState<string | null>(null)

  const displayRoles = allRoles
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)

  const handleToggle = async (roleId: string, hasRole: boolean) => {
    if (!serverId || loading) return
    setLoading(roleId)
    try {
      if (hasRole) {
        await roles.remove(serverId, memberId, roleId)
        removeMemberRole(memberId, roleId)
      } else {
        await roles.assign(serverId, memberId, roleId)
        addMemberRole(memberId, roleId)
      }
    } catch (err) {
      console.error('Failed to update role:', err)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="w-56 rounded-md border border-sol-bg-elevated bg-sol-bg-tertiary shadow-lg">
      <div className="flex items-center justify-between border-b border-sol-bg-elevated px-3 py-2">
        <span className="text-xs font-semibold uppercase text-sol-text-secondary">Roles</span>
        <button
          onClick={onClose}
          className="text-sol-text-secondary hover:text-sol-text-primary text-sm leading-none"
        >
          &times;
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto p-1.5">
        {displayRoles.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-sol-text-secondary">No roles available</p>
        )}
        {displayRoles.map((role) => {
          const hasRole = memberRoleIds.includes(role.id)
          const isLoading = loading === role.id
          return (
            <label
              key={role.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-sol-bg-elevated/50"
            >
              <input
                type="checkbox"
                checked={hasRole}
                disabled={isLoading}
                onChange={() => handleToggle(role.id, hasRole)}
                className="h-3.5 w-3.5 rounded border-sol-bg-elevated accent-amber-500"
              />
              {role.color && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: role.color }}
                />
              )}
              <span className="truncate text-sm text-sol-text-primary">{role.name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
