import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { usePermissionStore } from '@renderer/stores/permissionStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { roles as rolesApi } from '@renderer/services/api'
import type { MemberWithRoles, Role } from '@renderer/types/models'
import UserAvatar from '@renderer/components/common/UserAvatar'

export default function RoleSettingsPanel() {
  const roles = usePermissionStore((s) => s.roles)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const members = useServerStore((s) => s.members)
  const currentUserId = useAuthStore((s) => s.user?.id)

  const [membersWithRoles, setMembersWithRoles] = useState<MemberWithRoles[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeServer = servers.find((s) => s.id === activeServerId)
  const isOwner = activeServer?.owner_id === currentUserId

  // Assignable roles (not @everyone)
  const assignableRoles = useMemo(
    () => roles.filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position),
    [roles]
  )

  // Fetch members with their roles
  const fetchMembers = useCallback(async () => {
    if (!activeServerId) return
    setLoading(true)
    try {
      const data = await rolesApi.membersWithRoles(activeServerId)
      setMembersWithRoles(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [activeServerId])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  // Also merge in members from serverStore that may not be in membersWithRoles
  const allMembers = useMemo(() => {
    const map = new Map<string, MemberWithRoles>()
    for (const m of membersWithRoles) {
      map.set(m.id, m)
    }
    for (const m of members) {
      if (!map.has(m.id)) {
        map.set(m.id, { ...m, roles: [] })
      }
    }
    return Array.from(map.values())
  }, [membersWithRoles, members])

  // Filter and sort
  const filteredMembers = useMemo(() => {
    let list = allMembers
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          (m.display_name?.toLowerCase().includes(q))
      )
    }
    return list.sort((a, b) => {
      // Owner first
      if (a.id === activeServer?.owner_id) return -1
      if (b.id === activeServer?.owner_id) return 1
      // Then by role count desc
      const ra = a.roles?.length ?? 0
      const rb = b.roles?.length ?? 0
      if (ra !== rb) return rb - ra
      return (a.display_name ?? a.username).localeCompare(b.display_name ?? b.username)
    })
  }, [allMembers, search, activeServer?.owner_id])

  const selectedMember = allMembers.find((m) => m.id === selectedMemberId)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleAssignRole = async (memberId: string, roleId: string) => {
    if (!activeServerId) return
    setActionLoading(`${memberId}-${roleId}`)
    setError('')
    try {
      await rolesApi.assign(activeServerId, memberId, roleId)
      usePermissionStore.getState().addMemberRole(memberId, roleId)
      setMembersWithRoles((prev) =>
        prev.map((m) => {
          if (m.id !== memberId) return m
          const role = roles.find((r) => r.id === roleId)
          if (!role) return m
          return { ...m, roles: [...(m.roles ?? []), role] }
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveRole = async (memberId: string, roleId: string) => {
    if (!activeServerId) return
    setActionLoading(`${memberId}-${roleId}`)
    setError('')
    try {
      await rolesApi.remove(activeServerId, memberId, roleId)
      usePermissionStore.getState().removeMemberRole(memberId, roleId)
      setMembersWithRoles((prev) =>
        prev.map((m) => {
          if (m.id !== memberId) return m
          return { ...m, roles: (m.roles ?? []).filter((r) => r.id !== roleId) }
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove role')
    } finally {
      setActionLoading(null)
    }
  }

  const memberHasRole = (member: MemberWithRoles, roleId: string) =>
    (member.roles ?? []).some((r) => r.id === roleId)

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-sol-bg-elevated rounded-lg" />
        <div className="h-10 bg-sol-bg-elevated/50 rounded-lg" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-sol-bg-elevated/30 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Members</h2>
        <p className="text-sm text-sol-text-muted">
          Manage member roles. Click a member to assign or remove roles.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-sol-coral">{error}</p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-sol-text-muted">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members..."
          className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg pl-10 pr-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
        />
      </div>

      {/* Member list */}
      <div className="space-y-1">
        {filteredMembers.map((member) => {
          const isOwnerMember = member.id === activeServer?.owner_id
          const isSelf = member.id === currentUserId
          const isSelected = selectedMemberId === member.id
          const memberRoles = (member.roles ?? []).filter((r) => r.name !== '@everyone')

          return (
            <div key={member.id}>
              <button
                type="button"
                onClick={() => setSelectedMemberId(isSelected ? null : member.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                  isSelected
                    ? 'bg-sol-bg-secondary border border-sol-bg-elevated'
                    : 'hover:bg-sol-bg-elevated/40 border border-transparent'
                }`}
              >
                <UserAvatar avatarUrl={member.avatar_url} username={member.username} size="sm" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-sol-text-primary truncate">
                      {member.display_name ?? member.username}
                    </span>
                    {isOwnerMember && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-sol-amber/15 text-sol-amber uppercase">
                        Owner
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-sol-text-muted truncate block">
                    @{member.username}
                  </span>
                </div>

                {/* Role badges */}
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end max-w-[200px]">
                  {memberRoles.slice(0, 3).map((role) => (
                    <span
                      key={role.id}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap"
                      style={{
                        color: role.color || undefined,
                        borderColor: (role.color || '#666') + '40',
                        backgroundColor: (role.color || '#666') + '15',
                      }}
                    >
                      {role.name}
                    </span>
                  ))}
                  {memberRoles.length > 3 && (
                    <span className="text-[10px] text-sol-text-muted">+{memberRoles.length - 3}</span>
                  )}
                </div>

                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" className={`shrink-0 text-sol-text-muted transition-transform ${isSelected ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Expanded role management */}
              {isSelected && (
                <div className="ml-12 mr-4 mb-2 mt-1 space-y-3">
                  {/* Current roles */}
                  {memberRoles.length > 0 && (
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-1.5">Current Roles</p>
                      <div className="flex flex-wrap gap-1.5">
                        {memberRoles.map((role) => (
                          <span
                            key={role.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium pl-2.5 pr-1 py-1 rounded-lg border"
                            style={{
                              color: role.color || undefined,
                              borderColor: (role.color || '#666') + '30',
                              backgroundColor: (role.color || '#666') + '10',
                            }}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: role.color || '#99aab5' }}
                            />
                            {role.name}
                            {!isOwnerMember && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveRole(member.id, role.id) }}
                                disabled={actionLoading === `${member.id}-${role.id}`}
                                className="ml-0.5 p-0.5 rounded hover:bg-black/10 transition-colors disabled:opacity-50"
                                title={`Remove ${role.name}`}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add role dropdown */}
                  {!isOwnerMember && assignableRoles.length > 0 && (
                    <div className="relative" ref={selectedMemberId === member.id ? dropdownRef : undefined}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRoleDropdownOpen(!roleDropdownOpen) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sol-amber bg-sol-amber/10 border border-sol-amber/20 rounded-lg hover:bg-sol-amber/15 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Role
                      </button>
                      {roleDropdownOpen && selectedMemberId === member.id && (
                        <div className="absolute z-20 top-full left-0 mt-1 w-56 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl shadow-xl py-1 max-h-48 overflow-y-auto">
                          {assignableRoles.map((role) => {
                            const has = memberHasRole(member, role.id)
                            return (
                              <button
                                key={role.id}
                                type="button"
                                disabled={has || actionLoading === `${member.id}-${role.id}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleAssignRole(member.id, role.id)
                                  setRoleDropdownOpen(false)
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                                  has
                                    ? 'opacity-40 cursor-not-allowed'
                                    : 'hover:bg-sol-bg-elevated/50 cursor-pointer'
                                }`}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-inset ring-black/10"
                                  style={{ backgroundColor: role.color || '#99aab5' }}
                                />
                                <span className="text-sol-text-primary truncate">{role.name}</span>
                                {has && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto text-sol-amber shrink-0">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            )
                          })}
                          {assignableRoles.length === 0 && (
                            <p className="px-3 py-2 text-xs text-sol-text-muted">No roles created yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filteredMembers.length === 0 && (
          <p className="text-sm text-sol-text-muted text-center py-8">No members found.</p>
        )}
      </div>
    </div>
  )
}
