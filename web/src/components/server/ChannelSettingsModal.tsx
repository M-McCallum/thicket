import { useState } from 'react'
import { channels as channelsApi } from '@/services/api'
import { useServerStore } from '@/stores/serverStore'

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

  if (!channel) return null

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-sol-bg-secondary rounded-xl shadow-xl w-[440px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-sol-bg-elevated">
          <h3 className="font-display text-lg text-sol-amber">Channel Settings</h3>
          <button onClick={onClose} className="text-sol-text-muted hover:text-sol-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Channel Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
            />
          </div>

          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={500}
              placeholder="Set a channel topic"
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30"
            />
          </div>

          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Slow Mode</label>
            <p className="text-xs text-sol-text-muted mb-2">
              Limit how often members can send messages in this channel.
            </p>
            <div className="flex flex-wrap gap-2">
              {SLOW_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSlowModeInterval(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    slowModeInterval === opt.value
                      ? 'border-sol-amber bg-sol-amber/20 text-sol-amber'
                      : 'border-sol-bg-elevated bg-sol-bg-tertiary text-sol-text-secondary hover:text-sol-text-primary hover:border-sol-text-muted/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-sol-coral">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-sol-bg-elevated">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sol-text-muted hover:text-sol-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
