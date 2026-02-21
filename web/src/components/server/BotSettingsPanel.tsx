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

  useEffect(() => {
    loadBots()
  }, [loadBots])

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
    return <div className="text-sol-text-muted text-sm">Loading bots...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-sol-text-primary mb-4">Bot Management</h3>

        {/* Create bot form */}
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <label className="block text-sm text-sol-text-secondary mb-1">Bot Username</label>
            <input
              type="text"
              value={newBotName}
              onChange={(e) => setNewBotName(e.target.value)}
              placeholder="my-bot"
              maxLength={32}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newBotName.trim()}
            className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm"
          >
            {creating ? 'Creating...' : 'Create Bot'}
          </button>
        </div>

        {error && <p className="text-sm text-sol-coral mb-3">{error}</p>}

        {/* Token display (shown once after create/regenerate) */}
        {shownToken && (
          <div className="bg-sol-bg-tertiary border border-sol-amber/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-sol-amber mb-1 font-medium">Bot Token (copy now -- it will not be shown again)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-sol-bg-primary rounded px-2 py-1 text-sol-text-primary break-all select-all">
                {shownToken}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(shownToken)}
                className="px-2 py-1 bg-sol-bg-elevated text-sol-text-secondary rounded hover:text-sol-amber transition-colors text-xs shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Bot list */}
        {botList.length === 0 ? (
          <p className="text-sm text-sol-text-muted">No bots created yet.</p>
        ) : (
          <div className="space-y-2">
            {botList.map((bot) => (
              <div key={bot.id} className="flex items-center justify-between bg-sol-bg-tertiary rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-sol-text-primary">{bot.username}</p>
                  <p className="text-xs text-sol-text-muted">
                    Created {new Date(bot.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRegenerate(bot.id)}
                    className="px-2 py-1 text-xs text-sol-text-secondary hover:text-sol-amber transition-colors bg-sol-bg-elevated rounded"
                  >
                    Regenerate Token
                  </button>
                  {confirmDeleteId === bot.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(bot.id)}
                        className="px-2 py-1 text-xs text-sol-coral bg-sol-coral/10 rounded hover:bg-sol-coral/20 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-xs text-sol-text-muted hover:text-sol-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(bot.id)}
                      className="px-2 py-1 text-xs text-sol-coral hover:bg-sol-coral/10 rounded transition-colors"
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
    </div>
  )
}
