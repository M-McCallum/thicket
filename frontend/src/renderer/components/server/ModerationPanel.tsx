import { useState, useEffect, useCallback } from 'react'
import { useServerStore } from '@renderer/stores/serverStore'
import { moderation } from '@renderer/services/api'
import type { ServerBan, ServerTimeout, AuditLogEntry } from '@renderer/types/models'
import UserAvatar from '@renderer/components/common/UserAvatar'

type ModerationTab = 'bans' | 'timeouts' | 'audit-log'

const TIMEOUT_DURATIONS = [
  { label: '60 seconds', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '1 hour', value: 3600 },
  { label: '1 day', value: 86400 },
  { label: '1 week', value: 604800 },
]

export default function ModerationPanel() {
  const [tab, setTab] = useState<ModerationTab>('bans')

  const tabs: { id: ModerationTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'bans', label: 'Bans',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
    },
    {
      id: 'timeouts', label: 'Timeouts',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      id: 'audit-log', label: 'Audit Log',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    },
  ]

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Moderation</h2>
        <p className="text-sm text-sol-text-muted">Manage bans, timeouts, and view the audit log.</p>
      </div>

      <div className="flex gap-1 p-1 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${
              tab === t.id
                ? 'bg-sol-bg-elevated text-sol-text-primary font-medium shadow-sm'
                : 'text-sol-text-muted hover:text-sol-text-secondary'
            }`}
          >
            <span className={tab === t.id ? 'text-sol-amber' : ''}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bans' && <BansTab />}
      {tab === 'timeouts' && <TimeoutsTab />}
      {tab === 'audit-log' && <AuditLogTab />}
    </div>
  )
}

// --- Bans Tab ---

function BansTab() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const members = useServerStore((s) => s.members)
  const [bans, setBans] = useState<ServerBan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Ban form
  const [showBanForm, setShowBanForm] = useState(false)
  const [banSearch, setBanSearch] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banning, setBanning] = useState(false)

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

  const bannedUserIds = new Set(bans.map((b) => b.user_id))
  const bannableMembers = members.filter(
    (m) => !bannedUserIds.has(m.id) && m.username.toLowerCase().includes(banSearch.toLowerCase())
  )

  const handleBan = async (userId: string) => {
    if (!activeServerId) return
    setBanning(true)
    setError('')
    try {
      const ban = await moderation.ban(activeServerId, userId, banReason)
      setBans((prev) => [ban, ...prev])
      setBanReason('')
      setBanSearch('')
      setShowBanForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user')
    } finally {
      setBanning(false)
    }
  }

  const handleUnban = async (userId: string) => {
    if (!activeServerId) return
    try {
      await moderation.unban(activeServerId, userId)
      setBans((prev) => prev.filter((b) => b.user_id !== userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unban user')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-sol-bg-elevated/30 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-sol-coral">{error}</p>
        </div>
      )}

      {/* Ban a member */}
      {!showBanForm ? (
        <button
          onClick={() => setShowBanForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-sol-coral bg-sol-coral/10 border border-sol-coral/20 rounded-xl hover:bg-sol-coral/15 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          Ban a Member
        </button>
      ) : (
        <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-sol-text-primary">Ban a Member</h4>
            <button
              onClick={() => { setShowBanForm(false); setBanSearch(''); setBanReason('') }}
              className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <input
            type="text"
            value={banSearch}
            onChange={(e) => setBanSearch(e.target.value)}
            placeholder="Search for a member..."
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
          />

          {banSearch && (
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {bannableMembers.slice(0, 10).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (confirm(`Ban ${m.display_name ?? m.username}?`)) {
                      handleBan(m.id)
                    }
                  }}
                  disabled={banning}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-sol-bg-elevated/50 transition-colors text-left disabled:opacity-50"
                >
                  <UserAvatar avatarUrl={m.avatar_url} username={m.username} size="sm" />
                  <span className="text-sm text-sol-text-primary truncate">{m.display_name ?? m.username}</span>
                  <span className="text-xs text-sol-text-muted">@{m.username}</span>
                </button>
              ))}
              {bannableMembers.length === 0 && (
                <p className="text-xs text-sol-text-muted px-3 py-2">No matching members found.</p>
              )}
            </div>
          )}

          <input
            type="text"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="Reason (optional)"
            maxLength={512}
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
          />
        </div>
      )}

      {/* Ban list */}
      {bans.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-sol-bg-elevated flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <p className="text-sm text-sol-text-muted">No banned users</p>
          <p className="text-xs text-sol-text-muted/60 mt-1">Members you ban will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {bans.map((ban) => (
            <div key={ban.id} className="flex items-center gap-3 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-sol-coral/10 flex items-center justify-center text-sm font-medium text-sol-coral shrink-0">
                {(ban.display_name ?? ban.username ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-sol-text-primary truncate">
                    {ban.display_name ?? ban.username}
                  </span>
                  {ban.username && ban.display_name && (
                    <span className="text-xs text-sol-text-muted">@{ban.username}</span>
                  )}
                </div>
                {ban.reason && (
                  <p className="text-xs text-sol-text-muted mt-0.5 truncate">Reason: {ban.reason}</p>
                )}
                <p className="text-[10px] text-sol-text-muted/60 font-mono mt-0.5">
                  {new Date(ban.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleUnban(ban.user_id)}
                className="px-3 py-1.5 text-xs font-medium bg-sol-bg-elevated text-sol-text-secondary rounded-lg hover:text-sol-text-primary transition-colors shrink-0"
              >
                Unban
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Timeouts Tab ---

function TimeoutsTab() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const members = useServerStore((s) => s.members)
  const [timeouts, setTimeouts] = useState<ServerTimeout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Timeout form
  const [showTimeoutForm, setShowTimeoutForm] = useState(false)
  const [timeoutSearch, setTimeoutSearch] = useState('')
  const [timeoutDuration, setTimeoutDuration] = useState(300)
  const [timeoutReason, setTimeoutReason] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [timing, setTiming] = useState(false)

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

  const timedOutUserIds = new Set(timeouts.map((t) => t.user_id))
  const timeoutableMembers = members.filter(
    (m) => !timedOutUserIds.has(m.id) && m.username.toLowerCase().includes(timeoutSearch.toLowerCase())
  )

  const handleTimeout = async () => {
    if (!activeServerId || !selectedMemberId) return
    setTiming(true)
    setError('')
    try {
      const timeout = await moderation.timeout(activeServerId, selectedMemberId, timeoutDuration, timeoutReason)
      setTimeouts((prev) => [timeout, ...prev])
      setTimeoutReason('')
      setTimeoutSearch('')
      setSelectedMemberId(null)
      setShowTimeoutForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to timeout user')
    } finally {
      setTiming(false)
    }
  }

  const handleRemoveTimeout = async (userId: string) => {
    if (!activeServerId) return
    try {
      await moderation.removeTimeout(activeServerId, userId)
      setTimeouts((prev) => prev.filter((t) => t.user_id !== userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove timeout')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-sol-bg-elevated/30 rounded-xl" />
        ))}
      </div>
    )
  }

  const selectedMember = members.find((m) => m.id === selectedMemberId)

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-sol-coral">{error}</p>
        </div>
      )}

      {/* Timeout a member */}
      {!showTimeoutForm ? (
        <button
          onClick={() => setShowTimeoutForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-sol-amber bg-sol-amber/10 border border-sol-amber/20 rounded-xl hover:bg-sol-amber/15 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Timeout a Member
        </button>
      ) : (
        <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-sol-text-primary">Timeout a Member</h4>
            <button
              onClick={() => { setShowTimeoutForm(false); setTimeoutSearch(''); setTimeoutReason(''); setSelectedMemberId(null) }}
              className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Member selection */}
          {!selectedMemberId ? (
            <>
              <input
                type="text"
                value={timeoutSearch}
                onChange={(e) => setTimeoutSearch(e.target.value)}
                placeholder="Search for a member..."
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              />
              {timeoutSearch && (
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {timeoutableMembers.slice(0, 10).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMemberId(m.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-sol-bg-elevated/50 transition-colors text-left"
                    >
                      <UserAvatar avatarUrl={m.avatar_url} username={m.username} size="sm" />
                      <span className="text-sm text-sol-text-primary truncate">{m.display_name ?? m.username}</span>
                      <span className="text-xs text-sol-text-muted">@{m.username}</span>
                    </button>
                  ))}
                  {timeoutableMembers.length === 0 && (
                    <p className="text-xs text-sol-text-muted px-3 py-2">No matching members found.</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Selected member */}
              <div className="flex items-center gap-2.5 px-3 py-2 bg-sol-bg-tertiary rounded-lg">
                <UserAvatar avatarUrl={selectedMember?.avatar_url ?? null} username={selectedMember?.username ?? ''} size="sm" />
                <span className="text-sm text-sol-text-primary flex-1">{selectedMember?.display_name ?? selectedMember?.username}</span>
                <button
                  onClick={() => setSelectedMemberId(null)}
                  className="text-sol-text-muted hover:text-sol-text-primary text-xs"
                >
                  Change
                </button>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Duration</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {TIMEOUT_DURATIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setTimeoutDuration(d.value)}
                      className={`px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                        timeoutDuration === d.value
                          ? 'border-sol-amber/30 bg-sol-amber/10 text-sol-amber font-medium'
                          : 'border-sol-bg-elevated text-sol-text-secondary hover:border-sol-amber/20'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <input
                type="text"
                value={timeoutReason}
                onChange={(e) => setTimeoutReason(e.target.value)}
                placeholder="Reason (optional)"
                maxLength={512}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              />

              {/* Submit */}
              <button
                onClick={handleTimeout}
                disabled={timing}
                className="w-full px-4 py-2.5 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
              >
                {timing ? 'Applying...' : 'Apply Timeout'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Timeout list */}
      {timeouts.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-sol-bg-elevated flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <p className="text-sm text-sol-text-muted">No active timeouts</p>
          <p className="text-xs text-sol-text-muted/60 mt-1">Timed out members will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {timeouts.map((t) => {
            const isExpired = new Date(t.expires_at) < new Date()
            return (
              <div key={t.id} className="flex items-center gap-3 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-sol-amber/10 flex items-center justify-center text-sm font-medium text-sol-amber shrink-0">
                  {(t.display_name ?? t.username ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-sol-text-primary truncate">
                      {t.display_name ?? t.username}
                    </span>
                    {isExpired && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-sol-bg-elevated text-sol-text-muted uppercase">
                        Expired
                      </span>
                    )}
                  </div>
                  {t.reason && (
                    <p className="text-xs text-sol-text-muted mt-0.5 truncate">Reason: {t.reason}</p>
                  )}
                  <p className="text-[10px] text-sol-text-muted/60 font-mono mt-0.5">
                    Expires: {new Date(t.expires_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveTimeout(t.user_id)}
                  className="px-3 py-1.5 text-xs font-medium bg-sol-bg-elevated text-sol-text-secondary rounded-lg hover:text-sol-text-primary transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Audit Log Tab ---

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  MEMBER_BAN: { label: 'Banned', color: 'text-sol-coral' },
  MEMBER_UNBAN: { label: 'Unbanned', color: 'text-sol-sage' },
  MEMBER_KICK: { label: 'Kicked', color: 'text-sol-amber' },
  MEMBER_TIMEOUT: { label: 'Timed out', color: 'text-sol-amber' },
  MEMBER_TIMEOUT_REMOVE: { label: 'Removed timeout', color: 'text-sol-sage' },
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

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-sol-bg-elevated/30 rounded-xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
        <p className="text-sm text-sol-coral">{error}</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-2xl bg-sol-bg-elevated flex items-center justify-center mx-auto mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <p className="text-sm text-sol-text-muted">No audit log entries</p>
        <p className="text-xs text-sol-text-muted/60 mt-1">Moderation actions will be logged here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry) => {
        const action = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'text-sol-text-muted' }
        return (
          <div key={entry.id} className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-sol-text-primary">
                {entry.actor_username ?? 'Unknown'}
              </span>
              <span className={`text-sm ${action.color}`}>
                {action.label}
              </span>
              {entry.target_id && (
                <span className="text-xs text-sol-text-muted font-mono bg-sol-bg-elevated px-1.5 py-0.5 rounded">
                  {entry.target_id.slice(0, 8)}...
                </span>
              )}
              <span className="text-[10px] text-sol-text-muted/60 font-mono ml-auto">
                {new Date(entry.created_at).toLocaleString()}
              </span>
            </div>
            {entry.reason && (
              <p className="text-xs text-sol-text-muted mt-1">Reason: {entry.reason}</p>
            )}
          </div>
        )
      })}
      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full py-2.5 text-sm text-sol-text-muted hover:text-sol-amber transition-colors border border-dashed border-sol-bg-elevated rounded-xl hover:border-sol-amber/30"
        >
          Load more...
        </button>
      )}
    </div>
  )
}
