import { useState, useEffect } from 'react'
import type { User } from '@/types/models'
import { profile as profileApi } from '@/services/api'
import UserAvatar from '@/components/common/UserAvatar'

interface UserProfilePopupProps {
  userId: string
  onClose: () => void
  preloaded?: {
    display_name?: string | null
    username?: string
    status?: string
    avatar_url?: string | null
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

export default function UserProfilePopup({ userId, onClose, preloaded }: UserProfilePopupProps) {
  const [profile, setProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    profileApi.getPublic(userId).then((data: User) => {
      if (!cancelled) {
        setProfile(data)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  const displayName = profile?.display_name ?? preloaded?.display_name ?? preloaded?.username ?? 'Loading...'
  const username = profile?.username ?? preloaded?.username
  const status = profile?.status ?? preloaded?.status ?? 'offline'
  const avatarUrl = profile?.avatar_url ?? preloaded?.avatar_url

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-80 animate-grow-in"
      >
        <div className="flex flex-col items-center gap-4">
          <UserAvatar avatarUrl={avatarUrl} username={username} size="lg" />

          <div className="text-center">
            <h3 className="font-display text-lg text-sol-text">{displayName}</h3>
            {username && displayName !== username && (
              <p className="text-sm text-sol-text-secondary">{username}</p>
            )}
            {profile?.pronouns && (
              <p className="text-xs text-sol-text-muted mt-1">{profile.pronouns}</p>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-sol-text-secondary">
            <span className={`w-2.5 h-2.5 rounded-full ${statusColor(status)}`} />
            <span>{statusLabel(status)}</span>
          </div>

          {profile?.custom_status_text && (
            <div className="text-sm text-sol-text-secondary text-center">
              {profile.custom_status_emoji && <span className="mr-1">{profile.custom_status_emoji}</span>}
              <span>{profile.custom_status_text}</span>
            </div>
          )}

          {profile?.bio && (
            <div className="w-full border-t border-sol-bg-elevated pt-3">
              <p className="text-xs text-sol-text-secondary uppercase tracking-wider mb-1">About Me</p>
              <p className="text-sm text-sol-text whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}

          {loading && !profile && (
            <p className="text-xs text-sol-text-muted">Loading profile...</p>
          )}
        </div>
      </div>
    </div>
  )
}
