import { useState } from 'react'
import type { Server } from '@/types/models'
import { servers as serversApi } from '@/services/api'

interface ServerSettingsModalProps {
  server: Server
  onClose: () => void
}

export default function ServerSettingsModal({ server, onClose }: ServerSettingsModalProps) {
  const [name, setName] = useState(server.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await serversApi.update(server.id, { name: name.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-sol-bg-secondary rounded-xl p-6 w-96 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-sol-text-primary mb-4">Server Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
            />
          </div>

          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Invite Code</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={server.invite_code}
                readOnly
                className="flex-1 bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-muted text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(server.invite_code)}
                className="px-3 py-2 bg-sol-bg-elevated text-sol-text-secondary rounded-lg hover:text-sol-amber transition-colors text-sm"
              >
                Copy
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-sol-coral">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
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
