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

  // Auto-select first channel
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

  useEffect(() => {
    loadWebhooks()
  }, [loadWebhooks])

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
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-sol-text-primary mb-4">Webhooks</h3>

      {/* Channel selector */}
      <div>
        <label className="block text-sm text-sol-text-secondary mb-1">Channel</label>
        <select
          value={selectedChannelId}
          onChange={(e) => setSelectedChannelId(e.target.value)}
          className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30"
        >
          {textChannels.map((ch) => (
            <option key={ch.id} value={ch.id}>#{ch.name}</option>
          ))}
        </select>
      </div>

      {/* Create form */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm text-sol-text-secondary mb-1">Webhook Name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="GitHub Notifications"
            maxLength={80}
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim() || !selectedChannelId}
          className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm"
        >
          {creating ? 'Creating...' : 'Create Webhook'}
        </button>
      </div>

      {error && <p className="text-sm text-sol-coral">{error}</p>}

      {/* Newly created webhook URL */}
      {createdWebhook && createdWebhook.url && (
        <div className="bg-sol-bg-tertiary border border-sol-amber/30 rounded-lg p-3">
          <p className="text-sm text-sol-amber mb-1 font-medium">Webhook URL (copy now)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-sol-bg-primary rounded px-2 py-1 text-sol-text-primary break-all select-all">
              {API_ORIGIN}{createdWebhook.url}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(API_ORIGIN + (createdWebhook.url || ''))}
              className="px-2 py-1 bg-sol-bg-elevated text-sol-text-secondary rounded hover:text-sol-amber transition-colors text-xs shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {loading ? (
        <p className="text-sm text-sol-text-muted">Loading webhooks...</p>
      ) : webhookList.length === 0 ? (
        <p className="text-sm text-sol-text-muted">No webhooks for this channel.</p>
      ) : (
        <div className="space-y-2">
          {webhookList.map((wh) => (
            <div key={wh.id} className="flex items-center justify-between bg-sol-bg-tertiary rounded-lg px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-sol-text-primary">{wh.name}</p>
                <p className="text-xs text-sol-text-muted truncate">
                  {channelName(wh.channel_id)} - Created {new Date(wh.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  onClick={() => navigator.clipboard.writeText(getWebhookUrl(wh))}
                  className="px-2 py-1 text-xs text-sol-text-secondary hover:text-sol-amber transition-colors bg-sol-bg-elevated rounded"
                >
                  Copy URL
                </button>
                {confirmDeleteId === wh.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(wh.id)}
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
                    onClick={() => setConfirmDeleteId(wh.id)}
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
  )
}
