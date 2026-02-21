import { useState, useEffect, useCallback } from 'react'
import { webhooks as webhooksApi } from '@/services/api'
import { useServerStore } from '@/stores/serverStore'
import type { Webhook, Channel } from '@/types/models'

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api').replace(/\/api$/, '')

export default function WebhookManager() {
  const channels = useServerStore((s) => s.channels)
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')
  const [webhookList, setWebhookList] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [createdWebhook, setCreatedWebhook] = useState<Webhook | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const textChannels: Channel[] = channels.filter((c) => c.type === 'text')

  useEffect(() => {
    if (!selectedChannelId && textChannels.length > 0) {
      setSelectedChannelId(textChannels[0].id)
    }
  }, [textChannels, selectedChannelId])

  const loadWebhooks = useCallback(async () => {
    if (!selectedChannelId) return
    setLoading(true)
    setError('')
    try {
      const data = await webhooksApi.list(selectedChannelId)
      setWebhookList(data)
    } catch {
      setError('Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [selectedChannelId])

  useEffect(() => { loadWebhooks() }, [loadWebhooks])

  const handleCreate = async () => {
    if (!newName.trim() || !selectedChannelId) return
    setCreating(true)
    setError('')
    setCreatedWebhook(null)
    try {
      const wh = await webhooksApi.create(selectedChannelId, newName.trim())
      setCreatedWebhook(wh)
      setNewName('')
      await loadWebhooks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create webhook')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (webhookId: string) => {
    try {
      await webhooksApi.delete(webhookId)
      setConfirmDeleteId(null)
      await loadWebhooks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook')
    }
  }

  const getWebhookUrl = (webhook: Webhook) => {
    if (webhook.url) return API_ORIGIN + webhook.url
    return `${API_ORIGIN}/api/webhooks/${webhook.id}/<token>`
  }

  const channelName = (channelId: string) => {
    const ch = channels.find((c) => c.id === channelId)
    return ch ? `#${ch.name}` : channelId
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Webhooks</h2>
        <p className="text-sm text-sol-text-muted">Send messages to channels from external services.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-sol-coral">{error}</p>
        </div>
      )}

      {/* Create webhook */}
      <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
        <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Create Webhook</h4>

        <div>
          <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Channel</label>
          <select
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
          >
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Webhook Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="GitHub Notifications"
              maxLength={80}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !selectedChannelId}
            className="px-5 py-2.5 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>

      {/* Created webhook URL */}
      {createdWebhook && createdWebhook.url && (
        <div className="bg-sol-bg-secondary border border-sol-amber/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-amber shrink-0">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            <p className="text-sm text-sol-amber font-medium">Webhook URL</p>
          </div>
          <p className="text-xs text-sol-text-muted">Copy this URL to use in your integrations.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary break-all select-all font-mono">
              {API_ORIGIN}{createdWebhook.url}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(API_ORIGIN + (createdWebhook.url || ''))}
              className="px-3 py-2 bg-sol-bg-elevated text-sol-text-secondary rounded-lg hover:text-sol-amber transition-colors text-xs shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-sol-bg-elevated/30 rounded-xl" />)}
        </div>
      ) : webhookList.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-sol-bg-elevated flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <p className="text-sm text-sol-text-muted">No webhooks for this channel</p>
          <p className="text-xs text-sol-text-muted/60 mt-1">Create a webhook to receive external messages.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {webhookList.map((wh) => (
            <div key={wh.id} className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sol-bg-elevated flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sol-text-primary truncate">{wh.name}</p>
                <p className="text-[10px] text-sol-text-muted/60 font-mono truncate">
                  {channelName(wh.channel_id)} &middot; {new Date(wh.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => navigator.clipboard.writeText(getWebhookUrl(wh))}
                  className="px-2.5 py-1.5 text-xs text-sol-text-secondary hover:text-sol-amber bg-sol-bg-elevated rounded-lg transition-colors"
                >
                  Copy URL
                </button>
                {confirmDeleteId === wh.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(wh.id)}
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
                    onClick={() => setConfirmDeleteId(wh.id)}
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
