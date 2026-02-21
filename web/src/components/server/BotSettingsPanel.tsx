import { useState, useEffect, useCallback } from 'react'
import { bots as botsApi } from '@/services/api'
import type { BotUser } from '@/types/models'

export default function BotSettingsPanel() {
  const [botList, setBotList] = useState<BotUser[]>([])
  const [loading, setLoading] = useState(true)
  const [newBotName, setNewBotName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [shownToken, setShownToken] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadBots = useCallback(async () => {
    try {
      const data = await botsApi.list()
      setBotList(data)
    } catch {
      setError('Failed to load bots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadBots() }, [loadBots])

  const handleCreate = async () => {
    if (!newBotName.trim()) return
    setCreating(true)
    setError('')
    setShownToken(null)
    try {
      const result = await botsApi.create(newBotName.trim())
      setShownToken(result.token)
      setNewBotName('')
      await loadBots()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bot')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (botId: string) => {
    try {
      await botsApi.delete(botId)
      setConfirmDeleteId(null)
      await loadBots()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bot')
    }
  }

  const handleRegenerate = async (botId: string) => {
    setError('')
    try {
      const result = await botsApi.regenerateToken(botId)
      setShownToken(result.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate token')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-sol-bg-elevated rounded-lg" />
        <div className="h-10 bg-sol-bg-elevated/50 rounded-lg" />
        <div className="h-20 bg-sol-bg-elevated/30 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Bots</h2>
        <p className="text-sm text-sol-text-muted">Create and manage bot accounts for this server.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-sol-coral">{error}</p>
        </div>
      )}

      {/* Create bot */}
      <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Create Bot</h4>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Bot Username</label>
            <input
              type="text"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="my-bot"
              maxLength={32}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newBotName.trim()}
            className="px-5 py-2.5 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>

      {/* Token display */}
      {shownToken && (
        <div className="bg-sol-bg-secondary border border-sol-amber/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-amber shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <p className="text-sm text-sol-amber font-medium">Bot Token</p>
          </div>
          <p className="text-xs text-sol-text-muted">Copy this token now. It will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary break-all select-all font-mono">
              {shownToken}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(shownToken)}
              className="px-3 py-2 bg-sol-bg-elevated text-sol-text-secondary rounded-lg hover:text-sol-amber transition-colors text-xs shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Bot list */}
      {botList.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-sol-bg-elevated flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              <circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/>
            </svg>
          </div>
          <p className="text-sm text-sol-text-muted">No bots created yet</p>
          <p className="text-xs text-sol-text-muted/60 mt-1">Create a bot to get started with automation.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {botList.map((bot) => (
            <div key={bot.id} className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sol-bg-elevated flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  <circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sol-text-primary truncate">{bot.username}</p>
                <p className="text-[10px] text-sol-text-muted/60 font-mono">
                  Created {new Date(bot.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleRegenerate(bot.id)}
                  className="px-2.5 py-1.5 text-xs text-sol-text-secondary hover:text-sol-amber bg-sol-bg-elevated rounded-lg transition-colors"
                >
                  Regenerate
                </button>
                {confirmDeleteId === bot.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(bot.id)}
                      className="px-2.5 py-1.5 text-xs text-sol-coral bg-sol-coral/10 rounded-lg hover:bg-sol-coral/15 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1.5 text-xs text-sol-text-muted hover:text-sol-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(bot.id)}
                    className="px-2.5 py-1.5 text-xs text-sol-coral/70 hover:text-sol-coral hover:bg-sol-coral/10 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
