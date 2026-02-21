import { useState, useEffect, useCallback } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { moderation } from '@/services/api'
import type { ServerBan, ServerTimeout, AuditLogEntry } from '@/types/models'

type ModerationTab = 'bans' | 'timeouts' | 'audit-log'

export default function ModerationPanel() {
  const [tab, setTab] = useState<ModerationTab>('bans')

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(['bans', 'timeouts', 'audit-log'] as ModerationTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              tab === t
                ? 'bg-sol-amber/20 text-sol-amber'
                : 'text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-elevated/50'
            }`}
          >
            {t === 'bans' ? 'Bans' : t === 'timeouts' ? 'Timeouts' : 'Audit Log'}
          </button>
        ))}
      </div>

      {tab === 'bans' && <BansTab />}
      {tab === 'timeouts' && <TimeoutsTab />}
      {tab === 'audit-log' && <AuditLogTab />}
    </div>
  )
}

function BansTab() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const [bans, setBans] = useState<ServerBan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchBans = useCallback(async () => {
    if (!activeServerId) return
    setLoading(true)
    try {
      const data = await moderation.getBans(activeServerId)
      setBans(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bans')
    } finally {
      setLoading(false)
    }
  }, [activeServerId])

  useEffect(() => { fetchBans() }, [fetchBans])

  const handleUnban = async (userId: string) => {
    if (!activeServerId) return
    try {
      await moderation.unban(activeServerId, userId)
      setBans((prev) => prev.filter((b) => b.user_id !== userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unban user')
    }
  }

  if (loading) return <p className="text-sol-text-muted text-sm">Loading...</p>
  if (error) return <p className="text-sol-coral text-sm">{error}</p>

  if (bans.length === 0) {
    return <p className="text-sol-text-muted text-sm">No banned users.</p>
  }

  return (
    <div className="space-y-2">
      {bans.map((ban) => (
        <div key={ban.id} className="flex items-center justify-between bg-sol-bg-tertiary rounded-lg px-4 py-3">
          <div>
            <span className="text-sol-text-primary text-sm font-medium">
              {ban.display_name ?? ban.username}
            </span>
            {ban.username && ban.display_name && (
              <span className="text-sol-text-muted text-xs ml-2">@{ban.username}</span>
            )}
            {ban.reason && (
              <p className="text-sol-text-muted text-xs mt-0.5">Reason: {ban.reason}</p>
            )}
            <p className="text-sol-text-muted text-xs">
              Banned {new Date(ban.created_at).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => handleUnban(ban.user_id)}
            className="px-3 py-1 text-xs bg-sol-coral/20 text-sol-coral rounded-lg hover:bg-sol-coral/30 transition-colors"
          >
            Unban
          </button>
        </div>
      ))}
    </div>
  )
}

function TimeoutsTab() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const [timeouts, setTimeouts] = useState<ServerTimeout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchTimeouts = useCallback(async () => {
    if (!activeServerId) return
    setLoading(true)
    try {
      const data = await moderation.getTimeouts(activeServerId)
      setTimeouts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeouts')
    } finally {
      setLoading(false)
    }
  }, [activeServerId])

  useEffect(() => { fetchTimeouts() }, [fetchTimeouts])

  const handleRemoveTimeout = async (userId: string) => {
    if (!activeServerId) return
    try {
      await moderation.removeTimeout(activeServerId, userId)
      setTimeouts((prev) => prev.filter((t) => t.user_id !== userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove timeout')
    }
  }

  if (loading) return <p className="text-sol-text-muted text-sm">Loading...</p>
  if (error) return <p className="text-sol-coral text-sm">{error}</p>

  if (timeouts.length === 0) {
    return <p className="text-sol-text-muted text-sm">No active timeouts.</p>
  }

  return (
    <div className="space-y-2">
      {timeouts.map((t) => (
        <div key={t.id} className="flex items-center justify-between bg-sol-bg-tertiary rounded-lg px-4 py-3">
          <div>
            <span className="text-sol-text-primary text-sm font-medium">
              {t.display_name ?? t.username}
            </span>
            {t.username && t.display_name && (
              <span className="text-sol-text-muted text-xs ml-2">@{t.username}</span>
            )}
            {t.reason && (
              <p className="text-sol-text-muted text-xs mt-0.5">Reason: {t.reason}</p>
            )}
            <p className="text-sol-text-muted text-xs">
              Expires: {new Date(t.expires_at).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => handleRemoveTimeout(t.user_id)}
            className="px-3 py-1 text-xs bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 transition-colors"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

const ACTION_LABELS: Record<string, string> = {
  MEMBER_BAN: 'Banned member',
  MEMBER_UNBAN: 'Unbanned member',
  MEMBER_KICK: 'Kicked member',
  MEMBER_TIMEOUT: 'Timed out member',
  MEMBER_TIMEOUT_REMOVE: 'Removed timeout',
}

function AuditLogTab() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)

  const fetchEntries = useCallback(async (before?: string) => {
    if (!activeServerId) return
    if (!before) setLoading(true)
    try {
      const data = await moderation.getAuditLog(activeServerId, 50, before)
      if (before) {
        setEntries((prev) => [...prev, ...data])
      } else {
        setEntries(data)
      }
      setHasMore(data.length === 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [activeServerId])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const loadMore = () => {
    if (entries.length > 0) {
      fetchEntries(entries[entries.length - 1].created_at)
    }
  }

  if (loading) return <p className="text-sol-text-muted text-sm">Loading...</p>
  if (error) return <p className="text-sol-coral text-sm">{error}</p>

  if (entries.length === 0) {
    return <p className="text-sol-text-muted text-sm">No audit log entries.</p>
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="bg-sol-bg-tertiary rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sol-text-primary text-sm font-medium">
              {entry.actor_username ?? 'Unknown'}
            </span>
            <span className="text-sol-text-muted text-sm">
              {ACTION_LABELS[entry.action] ?? entry.action}
            </span>
            {entry.target_id && (
              <span className="text-sol-text-secondary text-xs font-mono">
                {entry.target_id.slice(0, 8)}...
              </span>
            )}
          </div>
          {entry.reason && (
            <p className="text-sol-text-muted text-xs mt-0.5">Reason: {entry.reason}</p>
          )}
          <p className="text-sol-text-muted text-xs">
            {new Date(entry.created_at).toLocaleString()}
          </p>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full py-2 text-sm text-sol-text-muted hover:text-sol-amber transition-colors"
        >
          Load more...
        </button>
      )}
    </div>
  )
}
