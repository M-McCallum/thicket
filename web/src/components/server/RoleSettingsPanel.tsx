import { useState, useEffect, useCallback } from 'react'
import { usePermissionStore } from '@/stores/permissionStore'
import { useServerStore } from '@/stores/serverStore'
import { roles as rolesApi } from '@/services/api'
import { parsePermissions } from '@/types/permissions'
import {
  PermViewChannels,
  PermSendMessages,
  PermManageMessages,
  PermManageChannels,
  PermManageRoles,
  PermKickMembers,
  PermBanMembers,
  PermManageServer,
  PermAddReactions,
  PermAttachFiles,
  PermPinMessages,
  PermVoiceConnect,
  PermVoiceSpeak,
  PermAdministrator,
} from '@/types/permissions'
import type { Role } from '@/types/models'

const PERMISSION_DEFS: { label: string; bit: bigint }[] = [
  { label: 'View Channels', bit: PermViewChannels },
  { label: 'Send Messages', bit: PermSendMessages },
  { label: 'Manage Messages', bit: PermManageMessages },
  { label: 'Manage Channels', bit: PermManageChannels },
  { label: 'Manage Roles', bit: PermManageRoles },
  { label: 'Kick Members', bit: PermKickMembers },
  { label: 'Ban Members', bit: PermBanMembers },
  { label: 'Manage Server', bit: PermManageServer },
  { label: 'Add Reactions', bit: PermAddReactions },
  { label: 'Attach Files', bit: PermAttachFiles },
  { label: 'Pin Messages', bit: PermPinMessages },
  { label: 'Voice Connect', bit: PermVoiceConnect },
  { label: 'Voice Speak', bit: PermVoiceSpeak },
  { label: 'Administrator', bit: PermAdministrator },
]

const DEFAULT_COLORS = [
  '#dc322f', '#cb4b16', '#b58900', '#859900',
  '#2aa198', '#268bd2', '#6c71c4', '#d33682',
]

export default function RoleSettingsPanel() {
  const roles = usePermissionStore((s) => s.roles)
  const activeServerId = useServerStore((s) => s.activeServerId)

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editPerms, setEditPerms] = useState(0n)
  const [editHoist, setEditHoist] = useState(false)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('')
  const [newPerms, setNewPerms] = useState(0n)
  const [newHoist, setNewHoist] = useState(false)

  const sortedRoles = [...roles].sort((a, b) => b.position - a.position)
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null
  const isEveryone = selectedRole?.name === '@everyone' && selectedRole?.position === 0

  // Populate edit form when selection changes
  useEffect(() => {
    if (!selectedRole) return
    setEditName(selectedRole.name)
    setEditColor(selectedRole.color ?? '')
    setEditPerms(parsePermissions(selectedRole.permissions))
    setEditHoist(selectedRole.hoist)
    setError('')
  }, [selectedRoleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePerm = useCallback((current: bigint, bit: bigint): bigint => {
    return (current & bit) !== 0n ? current & ~bit : current | bit
  }, [])

  const handleCreate = async () => {
    if (!activeServerId || !newName.trim()) return
    setSaving(true)
    setError('')
    try {
      const role = await rolesApi.create(activeServerId, {
        name: newName.trim(),
        color: newColor || undefined,
        permissions: newPerms.toString(),
        hoist: newHoist,
      })
      usePermissionStore.getState().addRole(role)
      setSelectedRoleId(role.id)
      setShowCreate(false)
      setNewName('')
      setNewColor('')
      setNewPerms(0n)
      setNewHoist(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!activeServerId || !selectedRole) return
    setSaving(true)
    setError('')
    try {
      const updated = await rolesApi.update(activeServerId, selectedRole.id, {
        name: editName.trim() || undefined,
        color: editColor || undefined,
        permissions: editPerms.toString(),
        hoist: editHoist,
      })
      usePermissionStore.getState().updateRole(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!activeServerId || !selectedRole || isEveryone) return
    if (!confirm(`Delete role "${selectedRole.name}"?`)) return
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

  const hasChanged =
    selectedRole &&
    (editName !== selectedRole.name ||
      (editColor || '') !== (selectedRole.color ?? '') ||
      editPerms !== parsePermissions(selectedRole.permissions) ||
      editHoist !== selectedRole.hoist)

  return (
    <div className="flex h-full">
      {/* Role list sidebar */}
      <div className="w-52 shrink-0 border-r border-sol-bg-elevated flex flex-col">
        <div className="px-3 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-sol-text-secondary uppercase tracking-wide">
            Roles
          </h3>
          <button
            onClick={() => {
              setShowCreate(true)
              setSelectedRoleId(null)
            }}
            className="text-sol-sage hover:text-sol-amber transition-colors text-lg leading-none"
            title="Create role"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {sortedRoles.map((role) => (
            <button
              key={role.id}
              onClick={() => {
                setSelectedRoleId(role.id)
                setShowCreate(false)
              }}
              className={`w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors ${
                selectedRoleId === role.id
                  ? 'bg-sol-amber/15 text-sol-amber'
                  : 'text-sol-text-secondary hover:bg-sol-bg-elevated hover:text-sol-text-primary'
              }`}
            >
              {role.color && (
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: role.color }}
                />
              )}
              <span className="truncate">{role.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {showCreate ? (
          <CreateRoleForm
            name={newName}
            setName={setNewName}
            color={newColor}
            setColor={setNewColor}
            perms={newPerms}
            setPerms={(bit) => setNewPerms((p) => togglePerm(p, bit))}
            hoist={newHoist}
            setHoist={setNewHoist}
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            saving={saving}
            error={error}
          />
        ) : selectedRole ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-sol-text-primary">
                Edit Role
              </h3>
              {!isEveryone && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm text-sol-coral bg-sol-coral/10 rounded-lg hover:bg-sol-coral/20 disabled:opacity-50 transition-colors"
                >
                  Delete Role
                </button>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm text-sol-text-secondary mb-1">
                Role Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={isEveryone}
                maxLength={100}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30 disabled:opacity-50"
              />
            </div>

            {/* Color */}
            {!isEveryone && (
              <div>
                <label className="block text-sm text-sol-text-secondary mb-2">
                  Role Color
                </label>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
            )}

            {/* Hoist */}
            {!isEveryone && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editHoist}
                  onChange={(e) => setEditHoist(e.target.checked)}
                  className="accent-sol-amber w-4 h-4"
                />
                <span className="text-sm text-sol-text-primary">
                  Display role members separately
                </span>
              </label>
            )}

            {/* Permissions */}
            <div>
              <label className="block text-sm text-sol-text-secondary mb-2">
                Permissions
              </label>
              <PermissionCheckboxes
                perms={editPerms}
                onToggle={(bit) => setEditPerms((p) => togglePerm(p, bit))}
              />
            </div>

            {error && <p className="text-sm text-sol-coral">{error}</p>}

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || !hasChanged}
                className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sol-text-muted text-sm">
            Select a role to edit or create a new one.
          </div>
        )}
      </div>
    </div>
  )
}

// --- Sub-components ---

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {DEFAULT_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            value === c ? 'border-sol-text-primary scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        type="color"
        value={value || '#268bd2'}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
        title="Custom color"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="text-xs text-sol-text-muted hover:text-sol-text-secondary transition-colors ml-1"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function PermissionCheckboxes({
  perms,
  onToggle,
}: {
  perms: bigint
  onToggle: (bit: bigint) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {PERMISSION_DEFS.map(({ label, bit }) => (
        <label
          key={label}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <input
            type="checkbox"
            checked={(perms & bit) !== 0n}
            onChange={() => onToggle(bit)}
            className="accent-sol-amber w-4 h-4"
          />
          <span className="text-sm text-sol-text-secondary group-hover:text-sol-text-primary transition-colors">
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}

function CreateRoleForm({
  name,
  setName,
  color,
  setColor,
  perms,
  setPerms,
  hoist,
  setHoist,
  onSave,
  onCancel,
  saving,
  error,
}: {
  name: string
  setName: (v: string) => void
  color: string
  setColor: (v: string) => void
  perms: bigint
  setPerms: (bit: bigint) => void
  hoist: boolean
  setHoist: (v: boolean) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-sol-text-primary">Create Role</h3>

      {/* Name */}
      <div>
        <label className="block text-sm text-sol-text-secondary mb-1">
          Role Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoFocus
          placeholder="New Role"
          className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
        />
      </div>

      {/* Color */}
      <div>
        <label className="block text-sm text-sol-text-secondary mb-2">
          Role Color
        </label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {/* Hoist */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={hoist}
          onChange={(e) => setHoist(e.target.checked)}
          className="accent-sol-amber w-4 h-4"
        />
        <span className="text-sm text-sol-text-primary">
          Display role members separately
        </span>
      </label>

      {/* Permissions */}
      <div>
        <label className="block text-sm text-sol-text-secondary mb-2">
          Permissions
        </label>
        <PermissionCheckboxes perms={perms} onToggle={setPerms} />
      </div>

      {error && <p className="text-sm text-sol-coral">{error}</p>}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sol-text-muted hover:text-sol-text-primary transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !name.trim()}
          className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm"
        >
          {saving ? 'Creating...' : 'Create Role'}
        </button>
      </div>
    </div>
  )
}
