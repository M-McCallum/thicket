import { useState, useEffect, useCallback } from 'react'
import { channels as channelsApi, channelsApi as channelsExtApi } from '@renderer/services/api'
import { useServerStore } from '@renderer/stores/serverStore'

const SLOW_MODE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '1h', value: 3600 },
]

interface ChannelSettingsModalProps {
  serverId: string
  channelId: string
  onClose: () => void
}

export default function ChannelSettingsModal({ serverId, channelId, onClose }: ChannelSettingsModalProps) {
  const channel = useServerStore((s) => s.channels.find((c) => c.id === channelId))
  const updateChannel = useServerStore((s) => s.updateChannel)
  const [name, setName] = useState(channel?.name ?? '')
  const [topic, setTopic] = useState(channel?.topic ?? '')
  const [slowModeInterval, setSlowModeInterval] = useState(channel?.slow_mode_interval ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!channel) return null

  const handleDeleteChannel = async () => {
    setDeleting(true)
    try {
      await channelsExtApi.delete(serverId, channelId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel')
    } finally {
      setDeleting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const updated = await channelsApi.update(serverId, channelId, {
        name: name.trim() || undefined,
        topic: topic,
        slow_mode_interval: slowModeInterval,
      })
      updateChannel(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-sol-bg border border-sol-bg-elevated rounded-xl shadow-2xl w-[480px] max-w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Channel settings"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-sol-bg-elevated bg-sol-bg-secondary">
          <div className="w-8 h-8 rounded-lg bg-sol-amber/15 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-amber">
              <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/>
              <circle cx="5" cy="19" r="1" fill="currentColor"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sol-text-primary truncate">#{channel.name}</p>
            <p className="text-[11px] text-sol-text-muted font-mono uppercase tracking-wider">Channel Settings</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-sol-bg-elevated flex items-center justify-center text-sol-text-muted hover:text-sol-text-primary hover:border-sol-text-muted transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Channel Identity */}
          <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-4">
            <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Channel Identity</h4>

            <div>
              <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Channel Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={500}
                placeholder="Set a channel topic"
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              />
            </div>
          </div>

          {/* Slow Mode */}
          <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4">
            <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-1">Slow Mode</h4>
            <p className="text-xs text-sol-text-muted mb-3">
              Limit how often members can send messages in this channel.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SLOW_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSlowModeInterval(opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                    slowModeInterval === opt.value
                      ? 'border-sol-amber/30 bg-sol-amber/10 text-sol-amber font-medium'
                      : 'border-sol-bg-elevated text-sol-text-secondary hover:border-sol-amber/20 hover:text-sol-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-sol-coral">{error}</p>
            </div>
          )}

          {/* Danger Zone */}
          <div className="border border-sol-coral/20 rounded-xl p-4 bg-sol-coral/[0.03]">
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <h4 className="text-sm font-medium text-sol-coral">Danger Zone</h4>
            </div>
            <p className="text-xs text-sol-text-muted mb-3 leading-relaxed">
              This will permanently delete this channel and all its messages. This action cannot be undone.
            </p>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteChannel}
                  disabled={deleting}
                  className="px-4 py-2 bg-sol-coral/15 text-sol-coral rounded-lg hover:bg-sol-coral/25 disabled:opacity-40 transition-colors text-sm font-medium"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 text-sol-text-muted hover:text-sol-text-primary text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 bg-sol-coral/15 text-sol-coral rounded-lg hover:bg-sol-coral/25 transition-colors text-sm font-medium"
              >
                Delete Channel
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-sol-bg-elevated bg-sol-bg-secondary">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-sol-text-muted hover:text-sol-text-primary transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
