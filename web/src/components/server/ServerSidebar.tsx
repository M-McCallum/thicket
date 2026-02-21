import { useState, lazy, Suspense } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import UserAvatar from '@/components/common/UserAvatar'
import ProfileModal from '@/components/profile/ProfileModal'

const SettingsOverlay = lazy(() => import('@/components/settings/SettingsOverlay'))

export default function ServerSidebar() {
  const { servers, activeServerId, setActiveServer, createServer, joinServer } = useServerStore()
  const isDiscoverOpen = useServerStore((s) => s.isDiscoverOpen)
  const { user } = useAuthStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [newServerName, setNewServerName] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newServerName.trim()) return
    const server = await createServer(newServerName.trim())
    setActiveServer(server.id)
    setNewServerName('')
    setShowCreate(false)
  }

  const handleJoinServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    await joinServer(inviteCode.trim())
    setInviteCode('')
    setShowJoin(false)
  }

  return (
    <div className="w-[72px] bg-sol-bg flex flex-col items-center py-3 gap-2 border-r border-sol-bg-elevated">
      {/* Home button */}
      <button
        onClick={() => useServerStore.getState().setActiveServerNull()}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200
          ${!activeServerId
            ? 'bg-sol-amber/20 rounded-xl text-sol-amber shadow-glow-amber'
            : 'bg-sol-bg-secondary text-sol-text-secondary hover:bg-sol-amber/20 hover:rounded-xl hover:text-sol-amber'
          }`}
        title="Direct Messages"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </button>

      <div className="w-8 h-px bg-sol-bg-elevated" />

      {/* Server list */}
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => setActiveServer(server.id)}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200
            ${
              activeServerId === server.id
                ? 'bg-sol-amber/20 rounded-xl text-sol-amber shadow-glow-amber'
                : 'bg-sol-bg-secondary text-sol-text-secondary hover:bg-sol-amber/10 hover:rounded-xl hover:text-sol-amber'
            }`}
          title={server.name}
        >
          <span className="font-display text-sm font-bold">
            {server.name.charAt(0).toUpperCase()}
          </span>
        </button>
      ))}

      {/* Add server */}
      <button
        onClick={() => setShowCreate(true)}
        className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center
                   hover:bg-sol-green/20 hover:rounded-xl transition-all duration-200
                   text-sol-green/50 hover:text-sol-green"
        title="Create Server"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </button>

      {/* Join server */}
      <button
        onClick={() => setShowJoin(true)}
        className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center
                   hover:bg-sol-sage/20 hover:rounded-xl transition-all duration-200
                   text-sol-sage/50 hover:text-sol-sage"
        title="Join Server"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 10l-4-4m4 4l-4 4m4-4H3" />
        </svg>
      </button>

      {/* Discover servers */}
      <button
        onClick={() => {
          useServerStore.getState().setActiveServerNull()
          useServerStore.getState().setDiscoverOpen(true)
        }}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center
                   hover:bg-sol-cyan/20 hover:rounded-xl transition-all duration-200
                   ${isDiscoverOpen
                     ? 'bg-sol-cyan/20 rounded-xl text-sol-cyan'
                     : 'bg-sol-bg-secondary text-sol-cyan/50 hover:text-sol-cyan'
                   }`}
        title="Discover Servers"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Settings gear */}
      <button
        onClick={() => setShowSettings(true)}
        className="w-10 h-10 rounded-full flex items-center justify-center
                   text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-secondary
                   transition-all duration-200"
        title="User Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>

      {/* User avatar / profile */}
      <button
        onClick={() => setShowProfile(true)}
        className="hover:opacity-80 transition-opacity"
        title={user?.username}
      >
        <UserAvatar avatarUrl={user?.avatar_url} username={user?.username} size="md" />
      </button>

      {/* Create server modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <form
            onSubmit={handleCreateServer}
            onClick={(e) => e.stopPropagation()}
            className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
          >
            <h3 className="font-display text-lg text-sol-amber mb-4">Create Server</h3>
            <input
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              className="input-field mb-4"
              placeholder="Server name"
              autoFocus
              required
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-danger">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile modal */}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}

      {/* Join server modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowJoin(false)}>
          <form
            onSubmit={handleJoinServer}
            onClick={(e) => e.stopPropagation()}
            className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
          >
            <h3 className="font-display text-lg text-sol-amber mb-4">Join Server</h3>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="input-field mb-4"
              placeholder="Invite code"
              autoFocus
              required
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowJoin(false)} className="btn-danger">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Join
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settings overlay */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsOverlay onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
    </div>
  )
}
