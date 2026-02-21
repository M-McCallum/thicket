import { useState, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import UserAvatar from '@/components/common/UserAvatar'
import { exports } from '@/services/api'

interface ProfileModalProps {
  onClose: () => void
}

const statusOptions = [
  { value: 'online', label: 'Online', color: 'bg-sol-green' },
  { value: 'idle', label: 'Idle', color: 'bg-sol-amber' },
  { value: 'dnd', label: 'Do Not Disturb', color: 'bg-sol-coral' },
  { value: 'invisible', label: 'Invisible', color: 'bg-sol-text-muted' }
] as const

const durationOptions = [
  { value: '', label: "Don't clear" },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: 'today', label: 'Today' }
] as const

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, logout, updateProfile, updateStatus, updateCustomStatus, uploadAvatar, deleteAvatar } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [pronouns, setPronouns] = useState(user?.pronouns ?? '')
  const [selectedStatus, setSelectedStatus] = useState(user?.status === 'offline' ? 'invisible' : (user?.status ?? 'online'))
  const [customStatusText, setCustomStatusText] = useState(user?.custom_status_text ?? '')
  const [customStatusEmoji, setCustomStatusEmoji] = useState(user?.custom_status_emoji ?? '')
  const [customStatusDuration, setCustomStatusDuration] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleEnterEdit = () => {
    setDisplayName(user?.display_name ?? '')
    setBio(user?.bio ?? '')
    setPronouns(user?.pronouns ?? '')
    setSelectedStatus(user?.status === 'offline' ? 'invisible' : (user?.status ?? 'online'))
    setCustomStatusText(user?.custom_status_text ?? '')
    setCustomStatusEmoji(user?.custom_status_emoji ?? '')
    setCustomStatusDuration('')
    setIsEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProfile({
        display_name: displayName || undefined,
        bio,
        pronouns
      })
      await updateStatus(selectedStatus)
      await updateCustomStatus({
        text: customStatusText,
        emoji: customStatusEmoji,
        expires_in: customStatusDuration || undefined
      })
      setIsEditing(false)
    } catch {
      // Error is handled by store
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadAvatar(file)
    } catch {
      // Error handled by store
    }
  }

  const handleDeleteAvatar = async () => {
    try {
      await deleteAvatar()
    } catch {
      // Error handled by store
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'online': return 'bg-sol-green'
      case 'idle': return 'bg-sol-amber'
      case 'dnd': return 'bg-sol-coral'
      default: return 'bg-sol-text-muted'
    }
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case 'online': return 'Online'
      case 'idle': return 'Idle'
      case 'dnd': return 'Do Not Disturb'
      default: return 'Offline'
    }
  }

  if (!user) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 max-h-[90vh] overflow-y-auto animate-grow-in"
        role="dialog"
        aria-modal="true"
        aria-label="User profile"
      >
        {isEditing ? (
          /* Edit Mode */
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-lg text-sol-amber">Edit Profile</h3>

            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleAvatarClick}
                className="relative group cursor-pointer"
                type="button"
              >
                <UserAvatar avatarUrl={user.avatar_url} username={user.username} size="lg" />
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-white font-medium">Change</span>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              {user.avatar_url && (
                <button
                  onClick={handleDeleteAvatar}
                  className="text-xs text-sol-coral hover:underline"
                  type="button"
                >
                  Remove avatar
                </button>
              )}
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-field"
                maxLength={64}
                placeholder={user.username}
              />
            </div>

            {/* Pronouns */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Pronouns</label>
              <input
                type="text"
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                className="input-field"
                maxLength={50}
                placeholder="e.g. they/them"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">About Me</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="input-field resize-none h-20"
                maxLength={190}
                placeholder="Tell us about yourself"
              />
              <p className="text-xs text-sol-text-muted text-right mt-1">{bio.length}/190</p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedStatus(opt.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm
                      ${selectedStatus === opt.value
                        ? 'border-sol-amber/50 bg-sol-amber/10 text-sol-text'
                        : 'border-sol-bg-elevated text-sol-text-secondary hover:border-sol-amber/30'
                      }`}
                    type="button"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${opt.color}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Status */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Custom Status</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={customStatusEmoji}
                  onChange={(e) => setCustomStatusEmoji(e.target.value)}
                  className="input-field w-16 text-center"
                  maxLength={64}
                  placeholder="emoji"
                />
                <input
                  type="text"
                  value={customStatusText}
                  onChange={(e) => setCustomStatusText(e.target.value)}
                  className="input-field flex-1"
                  maxLength={128}
                  placeholder="What's on your mind?"
                />
              </div>
              <select
                value={customStatusDuration}
                onChange={(e) => setCustomStatusDuration(e.target.value)}
                className="input-field text-sm"
              >
                {durationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setIsEditing(false)}
                className="btn-danger"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="btn-primary"
                disabled={saving}
                type="button"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          /* View Mode */
          <div className="flex flex-col items-center gap-4">
            <UserAvatar avatarUrl={user.avatar_url} username={user.username} size="lg" />

            <div className="text-center">
              <h3 className="font-display text-lg text-sol-text">{user.display_name || user.username}</h3>
              {user.display_name && user.display_name !== user.username && (
                <p className="text-sm text-sol-text-secondary">{user.username}</p>
              )}
              {user.pronouns && (
                <p className="text-xs text-sol-text-muted mt-1">{user.pronouns}</p>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 text-sm text-sol-text-secondary">
              <span className={`w-2.5 h-2.5 rounded-full ${statusColor(user.status)}`} />
              <span>{statusLabel(user.status)}</span>
            </div>

            {/* Custom Status */}
            {user.custom_status_text && (
              <div className="text-sm text-sol-text-secondary text-center">
                {user.custom_status_emoji && <span className="mr-1">{user.custom_status_emoji}</span>}
                <span>{user.custom_status_text}</span>
              </div>
            )}

            {/* Bio */}
            {user.bio && (
              <div className="w-full border-t border-sol-bg-elevated pt-3">
                <p className="text-xs text-sol-text-secondary uppercase tracking-wider mb-1">About Me</p>
                <p className="text-sm text-sol-text whitespace-pre-wrap">{user.bio}</p>
              </div>
            )}

            {/* Data & Privacy */}
            <DataPrivacySection />

            {/* Actions */}
            <div className="w-full flex flex-col gap-2 mt-2">
              <button onClick={handleEnterEdit} className="btn-primary w-full" type="button">
                Edit Profile
              </button>
              <button
                onClick={() => { onClose(); logout() }}
                className="btn-danger w-full"
                type="button"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function DataPrivacySection() {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await exports.accountData()
      triggerDownload(blob, 'account-data-export.json')
    } catch {
      // Could add toast later
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="w-full border-t border-sol-bg-elevated pt-3">
      <p className="text-xs text-sol-text-secondary uppercase tracking-wider mb-1">Data & Privacy</p>
      <p className="text-xs text-sol-text-muted mb-3">
        Download a copy of your account data including your profile, server memberships, and DM conversation metadata.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-sol-text-secondary hover:text-sol-text-primary bg-sol-bg/50 hover:bg-sol-bg-elevated/50 rounded-lg transition-colors disabled:opacity-50"
        type="button"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {exporting ? 'Exporting...' : 'Download My Data'}
      </button>
    </div>
  )
}
