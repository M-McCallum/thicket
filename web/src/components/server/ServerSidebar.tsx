import { useState } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'

export default function ServerSidebar() {
  const { servers, activeServerId, setActiveServer, createServer, joinServer } = useServerStore()
  const { logout, user } = useAuthStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
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
        className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center
                   hover:bg-sol-amber/20 hover:rounded-xl transition-all duration-200
                   text-sol-text-secondary hover:text-sol-amber"
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

      <div className="flex-1" />

      {/* User avatar / logout */}
      <button
        onClick={() => logout()}
        className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center
                   hover:bg-sol-coral/20 hover:rounded-xl transition-all duration-200
                   text-sol-text-secondary hover:text-sol-coral"
        title={`${user?.username} - Click to logout`}
      >
        <span className="font-display text-sm font-bold">
          {user?.username?.charAt(0).toUpperCase() ?? '?'}
        </span>
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
    </div>
  )
}
