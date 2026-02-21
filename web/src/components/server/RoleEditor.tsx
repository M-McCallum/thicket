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
      const maxPos = sortedRoles.length > 0 ? Math.max(...sortedRoles.map((r) => r.position)) : 0
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
    <div className="flex gap-4 h-full min-h-[400px]">
      {/* Left: Role list */}
      <div className="w-48 shrink-0 flex flex-col">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full mb-3 px-3 py-2 bg-sol-amber/15 text-sol-amber rounded-lg hover:bg-sol-amber/25 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {creating ? 'Creating...' : '+ Create Role'}
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
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors select-none ${
                selectedRoleId === role.id
                  ? 'bg-sol-bg-elevated'
                  : 'hover:bg-sol-bg-elevated/50'
              } ${dragOverIdx === idx ? 'border-t-2 border-sol-amber' : ''} ${
                dragIdx === idx ? 'opacity-40' : ''
              }`}
            >
              <div
                className="w-3 h-3 rounded-full shrink-0 border border-sol-bg-elevated"
                style={{ backgroundColor: role.color || '#99aab5' }}
              />
              <span className="text-sm truncate text-sol-text-primary">{role.name}</span>
            </div>
          ))}

          {/* @everyone role at bottom */}
          {everyoneRole && (
            <div
              onClick={() => setSelectedRoleId(everyoneRole.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors mt-2 border-t border-sol-bg-elevated pt-3 ${
                selectedRoleId === everyoneRole.id
                  ? 'bg-sol-bg-elevated'
                  : 'hover:bg-sol-bg-elevated/50'
              }`}
            >
              <div className="w-3 h-3 rounded-full shrink-0 bg-sol-text-muted border border-sol-bg-elevated" />
              <span className="text-sm text-sol-text-muted">@everyone</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Edit panel */}
      {selectedRole ? (
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Role name */}
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Role Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={isEveryone}
              maxLength={100}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30 disabled:opacity-50"
            />
          </div>

          {/* Color picker */}
          {!isEveryone && (
            <div>
              <label className="block text-sm text-sol-text-secondary mb-2">Role Color</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      editColor === color ? 'border-sol-amber scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <button
                  onClick={() => setEditColor('')}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 ${
                    !editColor ? 'border-sol-amber scale-110' : 'border-sol-bg-elevated'
                  } bg-sol-bg-tertiary`}
                  title="No color"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" className="text-sol-text-muted">
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-sol-text-muted">Hex:</span>
                <input
                  type="text"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  placeholder="#ffffff"
                  maxLength={7}
                  className="w-28 bg-sol-bg-tertiary border border-sol-bg-elevated rounded px-2 py-1 text-sm text-sol-text-primary focus:outline-none focus:border-sol-amber/30 font-mono"
                />
                {editColor && (
                  <div
                    className="w-6 h-6 rounded border border-sol-bg-elevated"
                    style={{ backgroundColor: editColor }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Hoist toggle */}
          {!isEveryone && (
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm text-sol-text-secondary">Display Separately</label>
                <p className="text-xs text-sol-text-muted mt-0.5">
                  Show members with this role separately in the member list.
                </p>
              </div>
              <button
                onClick={() => setEditHoist(!editHoist)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  editHoist ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    editHoist ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Permissions */}
          <div>
            <h4 className="text-sm font-semibold text-sol-text-primary mb-3">Permissions</h4>
            {Object.entries(permsByCategory).map(([category, perms]) => (
              <div key={category} className="mb-4">
                <div className={`text-xs font-mono uppercase tracking-wider mb-1 px-1 ${
                  category === 'Dangerous' ? 'text-sol-coral' : 'text-sol-text-muted'
                }`}>
                  {category}
                </div>
                <div className="space-y-0.5">
                  {perms.map((p) => (
                    <PermissionCheckbox
                      key={p.name}
                      label={p.name}
                      description={p.description}
                      checked={hasPermission(editPerms, p.perm) && (editPerms & p.perm) === p.perm}
                      onChange={(checked) => handleTogglePerm(p.perm, checked)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && <p className="text-sm text-sol-coral">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-sol-bg-elevated sticky bottom-0 bg-sol-bg-secondary pb-2">
            <button
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {!isEveryone && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 bg-sol-coral/15 text-sol-coral rounded-lg hover:bg-sol-coral/25 disabled:opacity-50 transition-colors text-sm"
              >
                Delete Role
              </button>
            )}
            {hasUnsavedChanges && (
              <span className="text-xs text-sol-amber ml-2">Unsaved changes</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sol-text-muted text-sm">
          Select a role to edit or create a new one.
        </div>
      )}
    </div>
  )
}
