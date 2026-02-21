import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { usePermissionStore } from '@/stores/permissionStore'
import { useServerStore } from '@/stores/serverStore'
import { roles as rolesApi } from '@/services/api'
import { PERMISSION_LABELS, parsePermissions, hasPermission } from '@/types/permissions'
import type { Role } from '@/types/models'
import PermissionCheckbox from './PermissionCheckbox'

const COLOR_PALETTE = [
  '#e74c3c', '#e91e63', '#9b59b6', '#673ab7',
  '#3498db', '#2196f3', '#00bcd4', '#009688',
  '#2ecc71', '#4caf50', '#8bc34a', '#cddc39',
  '#ffeb3b', '#ffc107', '#ff9800', '#ff5722',
  '#795548', '#607d8b', '#99aab5', '#ffffff',
]

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  General: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Text: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  Management: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  Moderation: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Voice: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>,
  Dangerous: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
}

export default function RoleEditor() {
  const roles = usePermissionStore((s) => s.roles)
  const activeServerId = useServerStore((s) => s.activeServerId)

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editHoist, setEditHoist] = useState(false)
  const [editPerms, setEditPerms] = useState(0n)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragItemRef = useRef<number | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['General']))

  // Sort roles by position desc (highest first), exclude @everyone for the list
  const sortedRoles = useMemo(
    () => [...roles].filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position),
    [roles]
  )

  const everyoneRole = useMemo(() => roles.find((r) => r.name === '@everyone'), [roles])

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  )

  // Populate edit fields when selecting a role
  useEffect(() => {
    if (selectedRole) {
      setEditName(selectedRole.name)
      setEditColor(selectedRole.color ?? '')
      setEditHoist(selectedRole.hoist)
      setEditPerms(parsePermissions(selectedRole.permissions))
      setError('')
    }
  }, [selectedRole])

  // Auto-select first role if none selected
  useEffect(() => {
    if (!selectedRoleId && sortedRoles.length > 0) {
      setSelectedRoleId(sortedRoles[0].id)
    }
  }, [sortedRoles, selectedRoleId])

  const handleTogglePerm = useCallback((perm: bigint, checked: boolean) => {
    setEditPerms((prev) => checked ? (prev | perm) : (prev & ~perm))
  }, [])

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  const handleSave = async () => {
    if (!activeServerId || !selectedRole || saving) return
    setSaving(true)
    setError('')
    try {
      const updated = await rolesApi.update(activeServerId, selectedRole.id, {
        name: editName.trim() || selectedRole.name,
        color: editColor || undefined,
        permissions: editPerms.toString(),
        hoist: editHoist,
      })
      usePermissionStore.getState().updateRole(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!activeServerId || !selectedRole || saving) return
    if (selectedRole.name === '@everyone') return
    setSaving(true)
    setError('')
    try {
      await rolesApi.delete(activeServerId, selectedRole.id)
      usePermissionStore.getState().removeRole(selectedRole.id)
      setSelectedRoleId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role')
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    if (!activeServerId || creating) return
    setCreating(true)
    setError('')
    try {
      const newRole = await rolesApi.create(activeServerId, {
        name: 'New Role',
        permissions: '0',
        hoist: false,
      })
      usePermissionStore.getState().addRole(newRole)
      setSelectedRoleId(newRole.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role')
    } finally {
      setCreating(false)
    }
  }

  // Drag and drop reorder
  const handleDragStart = (idx: number) => {
    setDragIdx(idx)
    dragItemRef.current = idx
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  const handleDrop = async (targetIdx: number) => {
    const sourceIdx = dragItemRef.current
    if (sourceIdx === null || sourceIdx === targetIdx || !activeServerId) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }

    const reordered = [...sortedRoles]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    // Assign new positions (highest first)
    const positions = reordered.map((r, i) => ({
      role_id: r.id,
      position: reordered.length - i,
    }))

    // Optimistically update
    for (const pos of positions) {
      const role = roles.find((r) => r.id === pos.role_id)
      if (role) {
        usePermissionStore.getState().updateRole({ ...role, position: pos.position })
      }
    }

    setDragIdx(null)
    setDragOverIdx(null)

    try {
      await rolesApi.reorder(activeServerId, positions)
    } catch {
      // Revert on failure by re-fetching
      const fresh = await rolesApi.list(activeServerId)
      usePermissionStore.getState().setRoles(fresh)
    }
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
  }

  // Group permissions by category
  const permsByCategory = useMemo(() => {
    const grouped: Record<string, typeof PERMISSION_LABELS> = {}
    for (const entry of PERMISSION_LABELS) {
      if (!grouped[entry.category]) grouped[entry.category] = []
      grouped[entry.category].push(entry)
    }
    return grouped
  }, [])

  const isEveryone = selectedRole?.name === '@everyone'
  const hasUnsavedChanges = selectedRole && (
    editName !== selectedRole.name ||
    editColor !== (selectedRole.color ?? '') ||
    editHoist !== selectedRole.hoist ||
    editPerms !== parsePermissions(selectedRole.permissions)
  )

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-[400px] max-w-full overflow-hidden">
      {/* Left: Role list */}
      <div className="w-full lg:w-56 shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-sol-text-primary">Roles</h2>
          <span className="text-xs text-sol-text-muted font-mono">{sortedRoles.length} roles</span>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2.5 bg-sol-amber/10 text-sol-amber rounded-xl border border-sol-amber/20 hover:bg-sol-amber/20 disabled:opacity-50 transition-all text-sm font-medium"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {creating ? 'Creating...' : 'Create Role'}
        </button>

        <div className="flex-1 overflow-y-auto space-y-0.5">
          {sortedRoles.map((role, idx) => (
            <div
              key={role.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              onClick={() => setSelectedRoleId(role.id)}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all select-none ${
                selectedRoleId === role.id
                  ? 'bg-sol-bg-elevated shadow-sm'
                  : 'hover:bg-sol-bg-elevated/50'
              } ${dragOverIdx === idx ? 'ring-2 ring-sol-amber/40 ring-offset-1 ring-offset-sol-bg' : ''} ${
                dragIdx === idx ? 'opacity-30 scale-95' : ''
              }`}
            >
              {/* Drag handle */}
              <svg width="8" height="14" viewBox="0 0 8 14" className="text-sol-text-muted/30 group-hover:text-sol-text-muted shrink-0 transition-colors">
                <circle cx="2" cy="2" r="1" fill="currentColor" /><circle cx="6" cy="2" r="1" fill="currentColor" />
                <circle cx="2" cy="7" r="1" fill="currentColor" /><circle cx="6" cy="7" r="1" fill="currentColor" />
                <circle cx="2" cy="12" r="1" fill="currentColor" /><circle cx="6" cy="12" r="1" fill="currentColor" />
              </svg>
              <div
                className="w-3 h-3 rounded-full shrink-0 ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: role.color || '#99aab5' }}
              />
              <span className="text-[13px] truncate text-sol-text-primary">{role.name}</span>
            </div>
          ))}

          {/* @everyone role at bottom */}
          {everyoneRole && (
            <>
              <div className="h-px bg-sol-bg-elevated mx-2 my-2" />
              <div
                onClick={() => setSelectedRoleId(everyoneRole.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                  selectedRoleId === everyoneRole.id
                    ? 'bg-sol-bg-elevated shadow-sm'
                    : 'hover:bg-sol-bg-elevated/50'
                }`}
              >
                <div className="w-[8px]" />
                <div className="w-3 h-3 rounded-full shrink-0 bg-sol-text-muted/40 ring-1 ring-inset ring-black/10" />
                <span className="text-[13px] text-sol-text-muted">@everyone</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Edit panel */}
      {selectedRole ? (
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden space-y-5">
          {/* Role header */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: (editColor || '#99aab5') + '20' }}
            >
              <div
                className="w-3.5 h-3.5 rounded-full"
                style={{ backgroundColor: editColor || '#99aab5' }}
              />
            </div>
            <div>
              <h3 className="text-base font-medium text-sol-text-primary">
                {isEveryone ? '@everyone' : editName || 'Untitled Role'}
              </h3>
              <p className="text-xs text-sol-text-muted">
                {isEveryone ? 'Default permissions for all members' : 'Customize this role\'s appearance and permissions'}
              </p>
            </div>
          </div>

          {/* Display section */}
          <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5 space-y-4">
            <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Display</h4>

            {/* Role name */}
            <div>
              <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Role Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={isEveryone}
                maxLength={100}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 disabled:opacity-50 transition-colors"
              />
            </div>

            {/* Color picker */}
            {!isEveryone && (
              <div>
                <label className="block text-xs text-sol-text-muted mb-2 font-mono uppercase tracking-wider">Role Color</label>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={`w-7 h-7 rounded-md transition-all ${
                        editColor === color
                          ? 'ring-2 ring-sol-amber ring-offset-2 ring-offset-sol-bg-secondary scale-110'
                          : 'hover:scale-110 hover:ring-1 hover:ring-sol-text-muted/30 hover:ring-offset-1 hover:ring-offset-sol-bg-secondary'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditColor('')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      !editColor
                        ? 'bg-sol-bg-elevated text-sol-text-primary'
                        : 'text-sol-text-muted hover:text-sol-text-secondary'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                    Default
                  </button>
                  <div className="h-4 w-px bg-sol-bg-elevated" />
                  <div className="flex items-center gap-2">
                    {editColor && (
                      <div
                        className="w-5 h-5 rounded ring-1 ring-inset ring-black/10"
                        style={{ backgroundColor: editColor }}
                      />
                    )}
                    <input
                      type="text"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      placeholder="#000000"
                      maxLength={7}
                      className="w-24 bg-sol-bg-tertiary border border-sol-bg-elevated rounded-md px-2 py-1.5 text-xs text-sol-text-primary focus:outline-none focus:border-sol-amber/30 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Hoist toggle */}
            {!isEveryone && (
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-sol-bg-elevated">
                <div>
                  <p className="text-sm text-sol-text-secondary">Display Separately</p>
                  <p className="text-xs text-sol-text-muted mt-0.5">Show members with this role separately in the member list.</p>
                </div>
                <button
                  onClick={() => setEditHoist(!editHoist)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    editHoist ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      editHoist ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Permissions section */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 px-1">Permissions</h4>

            {Object.entries(permsByCategory).map(([category, perms]) => {
              const isDanger = category === 'Dangerous'
              const isExpanded = expandedCategories.has(category)
              const enabledCount = perms.filter((p) =>
                hasPermission(editPerms, p.perm) && (editPerms & p.perm) === p.perm
              ).length

              return (
                <div
                  key={category}
                  className={`border rounded-xl overflow-hidden transition-colors ${
                    isDanger
                      ? 'border-sol-coral/15 bg-sol-coral/[0.02]'
                      : 'border-sol-bg-elevated bg-sol-bg-secondary'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${
                      isDanger
                        ? 'hover:bg-sol-coral/[0.04]'
                        : 'hover:bg-sol-bg-elevated/30'
                    }`}
                  >
                    <span className={`shrink-0 ${isDanger ? 'text-sol-coral' : 'text-sol-text-muted'}`}>
                      {CATEGORY_ICONS[category] ?? CATEGORY_ICONS.General}
                    </span>
                    <span className={`text-[13px] font-medium flex-1 ${isDanger ? 'text-sol-coral' : 'text-sol-text-primary'}`}>
                      {category}
                    </span>
                    {enabledCount > 0 && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                        isDanger
                          ? 'bg-sol-coral/15 text-sol-coral'
                          : 'bg-sol-amber/15 text-sol-amber'
                      }`}>
                        {enabledCount}/{perms.length}
                      </span>
                    )}
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" className={`shrink-0 text-sol-text-muted transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className={`px-1.5 pb-1.5 space-y-px ${isDanger ? 'border-t border-sol-coral/10' : 'border-t border-sol-bg-elevated'}`}>
                      {perms.map((p) => (
                        <PermissionCheckbox
                          key={p.name}
                          label={p.name}
                          description={p.description}
                          checked={hasPermission(editPerms, p.perm) && (editPerms & p.perm) === p.perm}
                          onChange={(checked) => handleTogglePerm(p.perm, checked)}
                          danger={isDanger}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-sol-coral">{error}</p>
            </div>
          )}

          {/* Sticky save bar */}
          {(hasUnsavedChanges || !isEveryone) && (
            <div className="sticky bottom-0 bg-sol-bg/80 backdrop-blur-sm border-t border-sol-bg-elevated -mx-1 px-1 pt-3 pb-1">
              <div className="flex items-center gap-3">
                {hasUnsavedChanges && (
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-sol-amber animate-pulse" />
                    <span className="text-xs text-sol-amber font-medium">Unsaved changes</span>
                  </div>
                )}
                {!hasUnsavedChanges && <div className="flex-1" />}

                {!isEveryone && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-3 py-2 text-sol-coral/70 hover:text-sol-coral hover:bg-sol-coral/10 rounded-lg disabled:opacity-50 transition-colors text-sm"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !hasUnsavedChanges}
                  className="px-5 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="w-12 h-12 rounded-2xl bg-sol-bg-elevated flex items-center justify-center mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <p className="text-sm text-sol-text-muted">Select a role to edit</p>
          <p className="text-xs text-sol-text-muted/60 mt-1">or create a new one to get started</p>
        </div>
      )}
    </div>
  )
}
