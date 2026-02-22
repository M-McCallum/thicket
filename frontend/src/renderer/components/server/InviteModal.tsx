import { useState, useEffect, useCallback } from 'react'
import type { ServerInvite } from '@renderer/types/models'
import { serverInvites, serverInvitations } from '@renderer/services/api'

interface InviteModalProps {
  serverId: string
  onClose: () => void
}

export default function InviteModal({ serverId, onClose }: InviteModalProps) {
  const [invites, setInvites] = useState<ServerInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Create form state
  const [maxUses, setMaxUses] = useState('')
  const [expiresIn, setExpiresIn] = useState('')

  // Username invite state
  const [inviteUsername, setInviteUsername] = useState('')
  const [sendingUsername, setSendingUsername] = useState(false)
  const [usernameSuccess, setUsernameSuccess] = useState('')
  const [usernameError, setUsernameError] = useState('')

  const fetchInvites = useCallback(async () => {
    try {
      const data = await serverInvites.list(serverId)
      setInvites(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invites')
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchInvites()
  }, [fetchInvites])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const parsedMaxUses = maxUses ? parseInt(maxUses, 10) : undefined
      let expiresAt: string | undefined
      if (expiresIn) {
        const hours = parseInt(expiresIn, 10)
        if (hours > 0) {
          expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
        }
      }
      const invite = await serverInvites.create(serverId, parsedMaxUses, expiresAt)
      setInvites((prev) => [invite, ...prev])
      setMaxUses('')
      setExpiresIn('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (inviteId: string) => {
    try {
      await serverInvites.delete(serverId, inviteId)
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invite')
    }
  }

  const handleCopy = async (code: string, id: string) => {
    const webUrl = import.meta.env.VITE_WEB_URL || window.location.origin
    const link = `${webUrl}/invite/${code}`
    await navigator.clipboard.writeText(link)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleUsernameInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteUsername.trim()) return
    setSendingUsername(true)
    setUsernameError('')
    setUsernameSuccess('')
    try {
      await serverInvitations.sendByUsername(serverId, inviteUsername.trim())
      setUsernameSuccess(`Invite sent to ${inviteUsername.trim()}!`)
      setInviteUsername('')
      setTimeout(() => setUsernameSuccess(''), 3000)
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setSendingUsername(false)
    }
  }

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return 'Never'
    const date = new Date(expiresAt)
    if (date.getTime() < Date.now()) return 'Expired'
    const diff = date.getTime() - Date.now()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-[500px] max-h-[80vh] flex flex-col animate-grow-in"
        role="dialog"
        aria-modal="true"
        aria-label="Invite people"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-sol-amber">Invite People</h3>
          <button onClick={onClose} className="text-sol-text-muted hover:text-sol-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Invite by username */}
        <form onSubmit={handleUsernameInvite} className="mb-4 p-3 bg-sol-bg/50 rounded-lg border border-sol-border">
          <p className="text-sm text-sol-text-secondary mb-2">Invite by username</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="Enter username"
              className="flex-1 bg-sol-bg-tertiary text-sol-text-primary border border-sol-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-sol-amber/30"
              autoFocus
            />
            <button
              type="submit"
              disabled={sendingUsername || !inviteUsername.trim()}
              className="px-3 py-1.5 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm font-medium whitespace-nowrap"
            >
              {sendingUsername ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
          {usernameSuccess && <p className="text-xs text-sol-sage mt-2">{usernameSuccess}</p>}
          {usernameError && <p className="text-xs text-sol-coral mt-2">{usernameError}</p>}
        </form>

        {/* Create new invite link form */}
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-sol-bg/50 rounded-lg border border-sol-border">
          <p className="text-sm text-sol-text-secondary mb-3">Create a shareable invite link</p>
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="block text-xs text-sol-text-muted mb-1">Max Uses (optional)</label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                min="1"
                placeholder="Unlimited"
                className="w-full bg-sol-bg-tertiary text-sol-text-primary border border-sol-border rounded px-2 py-1 text-sm focus:outline-none focus:border-sol-amber/30"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-sol-text-muted mb-1">Expires In (hours)</label>
              <select
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                className="w-full bg-sol-bg-tertiary text-sol-text-primary border border-sol-border rounded px-2 py-1 text-sm focus:outline-none focus:border-sol-amber/30"
              >
                <option value="">Never</option>
                <option value="1">1 hour</option>
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">1 day</option>
                <option value="168">7 days</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="w-full px-3 py-1.5 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {creating ? 'Creating...' : 'Generate Invite Link'}
          </button>
        </form>

        {error && (
          <p className="text-sm text-sol-coral mb-3">{error}</p>
        )}

        {/* Invite list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-sol-text-muted text-sm text-center py-4">Loading invites...</p>
          ) : invites.length === 0 ? (
            <p className="text-sol-text-muted text-sm text-center py-4">No invite links yet. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-3 p-3 bg-sol-bg/30 rounded-lg border border-sol-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-sol-text-primary truncate">
                      {invite.code}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-sol-text-muted">
                        Uses: {invite.uses}{invite.max_uses ? `/${invite.max_uses}` : ''}
                      </span>
                      <span className="text-xs text-sol-text-muted">
                        Expires: {formatExpiry(invite.expires_at)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(invite.code, invite.id)}
                    className="px-2 py-1 text-xs bg-sol-bg-elevated text-sol-text-secondary rounded hover:text-sol-amber transition-colors shrink-0"
                  >
                    {copiedId === invite.id ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => handleDelete(invite.id)}
                    className="px-2 py-1 text-xs text-sol-text-muted hover:text-sol-coral transition-colors shrink-0"
                    title="Delete invite"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
