import { useState, useEffect, lazy, Suspense } from 'react'
import type { Server, OnboardingPrompt } from '@/types/models'
import { servers as serversApi, onboarding as onboardingApi } from '@/services/api'
import { useServerStore } from '@/stores/serverStore'

const RoleSettingsPanel = lazy(() => import('./RoleSettingsPanel'))
const RoleEditor = lazy(() => import('./RoleEditor'))
const ModerationPanel = lazy(() => import('./ModerationPanel'))
const AutoModPanel = lazy(() => import('./AutoModPanel'))

interface ServerSettingsModalProps {
  server: Server
  onClose: () => void
}

type Tab = 'general' | 'visibility' | 'roles' | 'members' | 'moderation' | 'welcome' | 'onboarding' | 'automod'

export default function ServerSettingsModal({ server, onClose }: ServerSettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [name, setName] = useState(server.name)
  const [isPublic, setIsPublic] = useState(server.is_public ?? false)
  const [description, setDescription] = useState(server.description ?? '')
  const [gifsEnabled, setGifsEnabled] = useState(server.gifs_enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await serversApi.update(server.id, { name: name.trim(), gifs_enabled: gifsEnabled })
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
            onClick={() => setTab('roles')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'roles'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            Roles
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
          <button
            onClick={() => setTab('moderation')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'moderation'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            Moderation
          </button>
          <button
            onClick={() => setTab('welcome')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'welcome'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            Welcome
          </button>
          <button
            onClick={() => setTab('onboarding')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'onboarding'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            Onboarding
          </button>
          <button
            onClick={() => setTab('automod')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'automod'
                ? 'border-sol-amber text-sol-amber'
                : 'border-transparent text-sol-text-muted hover:text-sol-text-primary'
            }`}
          >
            AutoMod
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

              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm text-sol-text-secondary">GIFs</label>
                    <p className="text-xs text-sol-text-muted mt-0.5">
                      Allow members to send GIF messages in this server.
                    </p>
                  </div>
                  <button
                    onClick={() => setGifsEnabled(!gifsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      gifsEnabled ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        gifsEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
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

          {tab === 'roles' && (
            <Suspense fallback={<div className="text-sol-text-muted text-sm">Loading...</div>}>
              <RoleEditor />
            </Suspense>
          )}

          {tab === 'members' && (
            <Suspense fallback={<div className="text-sol-text-muted text-sm">Loading...</div>}>
              <RoleSettingsPanel />
            </Suspense>
          )}

          {tab === 'moderation' && (
            <Suspense fallback={<div className="text-sol-text-muted text-sm">Loading...</div>}>
              <ModerationPanel />
            </Suspense>
          )}

          {tab === 'welcome' && (
            <WelcomeSettingsTab serverId={server.id} />
          )}

          {tab === 'onboarding' && (
            <OnboardingSettingsTab serverId={server.id} />
          )}

          {tab === 'automod' && (
            <Suspense fallback={<div className="text-sol-text-muted text-sm">Loading...</div>}>
              <AutoModPanel />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Welcome Settings Tab ---

function WelcomeSettingsTab({ serverId }: { serverId: string }) {
  const channels = useServerStore((s) => s.channels)
  const [message, setMessage] = useState('')
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    onboardingApi.getWelcome(serverId)
      .then((cfg) => {
        setMessage(cfg.welcome_message)
        setSelectedChannels(cfg.welcome_channels)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [serverId])

  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await onboardingApi.updateWelcome(serverId, {
        welcome_message: message,
        welcome_channels: selectedChannels,
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sol-text-muted text-sm">Loading...</div>

  const textChannels = channels.filter((c) => c.type === 'text')

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm text-sol-text-secondary mb-1">Welcome Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Write a welcome message for new members..."
          className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30 resize-none text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-sol-text-secondary mb-2">Recommended Channels</label>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {textChannels.map((ch) => (
            <label
              key={ch.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-sol-bg-elevated cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedChannels.includes(ch.id)}
                onChange={() => toggleChannel(ch.id)}
                className="accent-sol-amber"
              />
              <span className="text-sol-text-muted text-sm">#</span>
              <span className="text-sol-text-primary text-sm">{ch.name}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-sol-coral">{error}</p>}
      {success && <p className="text-sm text-sol-sage">Saved!</p>}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// --- Onboarding Settings Tab ---

interface EditablePrompt {
  tempId: string
  title: string
  description: string
  required: boolean
  options: EditableOption[]
}

interface EditableOption {
  tempId: string
  label: string
  description: string
  emoji: string
  role_ids: string[]
  channel_ids: string[]
}

let nextTempId = 0
function genTempId() {
  return `temp_${++nextTempId}`
}

function OnboardingSettingsTab({ serverId }: { serverId: string }) {
  const [prompts, setPrompts] = useState<EditablePrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    onboardingApi.getPrompts(serverId)
      .then((data) => {
        setPrompts(
          data.map((p) => ({
            tempId: p.id || genTempId(),
            title: p.title,
            description: p.description,
            required: p.required,
            options: p.options.map((o) => ({
              tempId: o.id || genTempId(),
              label: o.label,
              description: o.description,
              emoji: o.emoji,
              role_ids: o.role_ids,
              channel_ids: o.channel_ids,
            })),
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [serverId])

  const addPrompt = () => {
    setPrompts((prev) => [
      ...prev,
      { tempId: genTempId(), title: '', description: '', required: false, options: [] },
    ])
  }

  const removePrompt = (tempId: string) => {
    setPrompts((prev) => prev.filter((p) => p.tempId !== tempId))
  }

  const updatePrompt = (tempId: string, field: keyof EditablePrompt, value: unknown) => {
    setPrompts((prev) =>
      prev.map((p) => (p.tempId === tempId ? { ...p, [field]: value } : p))
    )
  }

  const addOption = (promptTempId: string) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.tempId === promptTempId
          ? {
              ...p,
              options: [
                ...p.options,
                { tempId: genTempId(), label: '', description: '', emoji: '', role_ids: [], channel_ids: [] },
              ],
            }
          : p
      )
    )
  }

  const removeOption = (promptTempId: string, optTempId: string) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.tempId === promptTempId
          ? { ...p, options: p.options.filter((o) => o.tempId !== optTempId) }
          : p
      )
    )
  }

  const updateOption = (promptTempId: string, optTempId: string, field: keyof EditableOption, value: unknown) => {
    setPrompts((prev) =>
      prev.map((p) =>
        p.tempId === promptTempId
          ? {
              ...p,
              options: p.options.map((o) =>
                o.tempId === optTempId ? { ...o, [field]: value } : o
              ),
            }
          : p
      )
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const payload: OnboardingPrompt[] = prompts.map((p, i) => ({
        id: '',
        server_id: serverId,
        title: p.title,
        description: p.description,
        required: p.required,
        position: i,
        created_at: '',
        options: p.options.map((o, j) => ({
          id: '',
          prompt_id: '',
          label: o.label,
          description: o.description,
          emoji: o.emoji,
          role_ids: o.role_ids,
          channel_ids: o.channel_ids,
          position: j,
        })),
      }))
      await onboardingApi.updatePrompts(serverId, payload)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sol-text-muted text-sm">Loading...</div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-sol-text-muted">
        Configure onboarding prompts that new members will step through after joining.
        Each prompt can have multiple options that assign roles.
      </p>

      {prompts.map((prompt, pi) => (
        <div key={prompt.tempId} className="border border-sol-bg-elevated rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Prompt {pi + 1}
            </span>
            <button
              onClick={() => removePrompt(prompt.tempId)}
              className="text-sol-coral/60 hover:text-sol-coral text-xs transition-colors"
            >
              Remove
            </button>
          </div>

          <input
            type="text"
            placeholder="Question title"
            value={prompt.title}
            onChange={(e) => updatePrompt(prompt.tempId, 'title', e.target.value)}
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30"
          />

          <input
            type="text"
            placeholder="Description (optional)"
            value={prompt.description}
            onChange={(e) => updatePrompt(prompt.tempId, 'description', e.target.value)}
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30"
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={prompt.required}
              onChange={(e) => updatePrompt(prompt.tempId, 'required', e.target.checked)}
              className="accent-sol-amber"
            />
            <span className="text-sm text-sol-text-secondary">Required</span>
          </label>

          {/* Options */}
          <div className="space-y-2 pl-4 border-l border-sol-bg-elevated">
            <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">Options</span>
            {prompt.options.map((opt) => (
              <div key={opt.tempId} className="flex items-start gap-2">
                <input
                  type="text"
                  placeholder="Emoji"
                  value={opt.emoji}
                  onChange={(e) => updateOption(prompt.tempId, opt.tempId, 'emoji', e.target.value)}
                  className="w-12 bg-sol-bg-tertiary border border-sol-bg-elevated rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-sol-amber/30"
                />
                <input
                  type="text"
                  placeholder="Label"
                  value={opt.label}
                  onChange={(e) => updateOption(prompt.tempId, opt.tempId, 'label', e.target.value)}
                  className="flex-1 bg-sol-bg-tertiary border border-sol-bg-elevated rounded px-2 py-1 text-sm text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={opt.description}
                  onChange={(e) => updateOption(prompt.tempId, opt.tempId, 'description', e.target.value)}
                  className="flex-1 bg-sol-bg-tertiary border border-sol-bg-elevated rounded px-2 py-1 text-sm text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
                />
                <button
                  onClick={() => removeOption(prompt.tempId, opt.tempId)}
                  className="text-sol-coral/60 hover:text-sol-coral text-xs mt-1 transition-colors"
                >
                  x
                </button>
              </div>
            ))}
            <button
              onClick={() => addOption(prompt.tempId)}
              className="text-xs text-sol-amber/70 hover:text-sol-amber transition-colors"
            >
              + Add Option
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={addPrompt}
        className="w-full py-2 border border-dashed border-sol-bg-elevated rounded-lg text-sm text-sol-text-muted hover:text-sol-amber hover:border-sol-amber/30 transition-colors"
      >
        + Add Prompt
      </button>

      {error && <p className="text-sm text-sol-coral">{error}</p>}
      {success && <p className="text-sm text-sol-sage">Saved!</p>}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Onboarding'}
        </button>
      </div>
    </div>
  )
}
