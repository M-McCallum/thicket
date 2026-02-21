import { useState, lazy, Suspense } from 'react'
import type { Server } from '@/types/models'
import { servers as serversApi } from '@/services/api'

const RoleSettingsPanel = lazy(() => import('./RoleSettingsPanel'))

interface ServerSettingsModalProps {
  server: Server
  onClose: () => void
}

type Tab = 'general' | 'visibility' | 'members'

export default function ServerSettingsModal({ server, onClose }: ServerSettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [name, setName] = useState(server.name)
  const [isPublic, setIsPublic] = useState(server.is_public ?? false)
  const [description, setDescription] = useState(server.description ?? '')
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

  const handleSaveVisibility = async () => {
    setSaving(true)
    setError('')
    try {
      await serversApi.update(server.id, { is_public: isPublic, description: description.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update visibility')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-sol-bg-secondary rounded-xl shadow-xl w-[700px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab header */}
        <div className="flex items-center border-b border-sol-bg-elevated px-6 pt-4">
          <button
            onClick={() => setTab('general')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'general'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setTab('visibility')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'visibility'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            Visibility
          </button>
          <button
            onClick={() => setTab('members')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'members'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            Members
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="text-sol-text-muted hover:text-sol-text-primary transition-colors pb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'general' && (
            <div className="space-y-4 max-w-md">
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

              <div className="flex justify-end gap-2 pt-2">
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
          )}

          {tab === 'visibility' && (
            <div className="space-y-4 max-w-md">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-sm text-sol-text-secondary">Public Server</label>
                    <p className="text-xs text-sol-text-muted mt-0.5">
                      Allow anyone to find and join this server through Discover.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsPublic(!isPublic)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isPublic ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        isPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-sol-text-secondary mb-1">Description</label>
                <p className="text-xs text-sol-text-muted mb-2">
                  A short description shown on the Discover page.
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={4}
                  placeholder="Tell people what this server is about..."
                  className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30 resize-none"
                />
                <p className="text-xs text-sol-text-muted mt-1 text-right">
                  {description.length}/500
                </p>
              </div>

              {error && <p className="text-sm text-sol-coral">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sol-text-muted hover:text-sol-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVisibility}
                  disabled={saving}
                  className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {tab === 'members' && (
            <Suspense fallback={<div className="text-sol-text-muted text-sm">Loading...</div>}>
              <RoleSettingsPanel />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}
