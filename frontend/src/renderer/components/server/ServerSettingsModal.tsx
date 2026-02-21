import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import type { Server, OnboardingPrompt } from '@renderer/types/models'
import { servers as serversApi, onboarding as onboardingApi } from '@renderer/services/api'
import { useServerStore } from '@renderer/stores/serverStore'
import { useAuthStore } from '@renderer/stores/authStore'

const RoleSettingsPanel = lazy(() => import('./RoleSettingsPanel'))
const RoleEditor = lazy(() => import('./RoleEditor'))
const ModerationPanel = lazy(() => import('./ModerationPanel'))
const AutoModPanel = lazy(() => import('./AutoModPanel'))
const BotSettingsPanel = lazy(() => import('./BotSettingsPanel'))
const WebhookManager = lazy(() => import('./WebhookManager'))

interface ServerSettingsModalProps {
  server: Server
  onClose: () => void
}

type Tab = 'general' | 'visibility' | 'roles' | 'members' | 'moderation' | 'welcome' | 'onboarding' | 'automod' | 'bots' | 'webhooks' | 'retention'

// Tab definitions with icons and grouping
const TAB_GROUPS: { label: string; tabs: { id: Tab; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: 'Server',
    tabs: [
      {
        id: 'general', label: 'General',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      },
      {
        id: 'visibility', label: 'Visibility',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      },
    ]
  },
  {
    label: 'Members',
    tabs: [
      {
        id: 'roles', label: 'Roles',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      },
      {
        id: 'members', label: 'Members',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      },
    ]
  },
  {
    label: 'Safety',
    tabs: [
      {
        id: 'moderation', label: 'Moderation',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      },
      {
        id: 'automod', label: 'AutoMod',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
      },
    ]
  },
  {
    label: 'Engagement',
    tabs: [
      {
        id: 'welcome', label: 'Welcome',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      },
      {
        id: 'onboarding', label: 'Onboarding',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      },
    ]
  },
  {
    label: 'Integrations',
    tabs: [
      {
        id: 'bots', label: 'Bots',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="4" r="1" fill="currentColor"/><circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/></svg>
      },
      {
        id: 'webhooks', label: 'Webhooks',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      },
    ]
  },
  {
    label: 'Data',
    tabs: [
      {
        id: 'retention', label: 'Retention',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      },
    ]
  },
]

// Flat tab list for mobile
const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs)

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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex bg-sol-bg" role="dialog" aria-modal="true" aria-label="Server settings">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 bg-sol-bg-secondary flex-col border-r border-sol-bg-elevated overflow-y-auto">
        {/* Server header */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-sol-amber/15 flex items-center justify-center shrink-0">
              <span className="font-display text-sm font-bold text-sol-amber">
                {server.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-sol-text-primary truncate">{server.name}</p>
              <p className="text-[11px] text-sol-text-muted font-mono uppercase tracking-wider">Server Settings</p>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="flex-1 px-3 pb-3">
          {TAB_GROUPS.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="h-px bg-sol-bg-elevated mx-2 my-2" />}
              <p className="px-2 mb-1 text-[10px] font-mono uppercase tracking-widest text-sol-text-muted/60">
                {group.label}
              </p>
              {group.tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] transition-all duration-150 mb-px ${
                    tab === t.id
                      ? 'bg-sol-amber/15 text-sol-amber font-medium'
                      : 'text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-elevated/50'
                  }`}
                >
                  <span className={`shrink-0 ${tab === t.id ? 'text-sol-amber' : 'text-sol-text-muted'}`}>
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Close button */}
        <div className="p-3 border-t border-sol-bg-elevated">
          <button
            onClick={onClose}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-elevated/50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            Close Settings
          </button>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center border-b border-sol-bg-elevated bg-sol-bg-secondary">
          <div className="flex-1 overflow-x-auto flex gap-0.5 px-3 py-2 scrollbar-hide">
            {ALL_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-sol-amber/20 text-sol-amber'
                    : 'text-sol-text-muted hover:text-sol-text-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 mr-2 text-sol-text-muted hover:text-sol-text-primary transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 sm:px-8 lg:px-[8%] xl:px-[12%] lg:py-8 relative">
            {/* Desktop close button */}
            <button
              onClick={onClose}
              className="hidden lg:flex absolute top-4 right-4 w-9 h-9 rounded-full border border-sol-bg-elevated
                         items-center justify-center text-sol-text-muted hover:text-sol-text-primary
                         hover:border-sol-text-muted transition-colors"
              title="Close (Esc)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

          {tab === 'general' && (
            <GeneralTab
              server={server}
              name={name}
              setName={setName}
              gifsEnabled={gifsEnabled}
              setGifsEnabled={setGifsEnabled}
              saving={saving}
              error={error}
              onSave={handleSave}
              onClose={onClose}
            />
          )}

          {tab === 'visibility' && (
            <VisibilityTab
              isPublic={isPublic}
              setIsPublic={setIsPublic}
              description={description}
              setDescription={setDescription}
              saving={saving}
              error={error}
              onSave={handleSaveVisibility}
              onClose={onClose}
            />
          )}

          {tab === 'roles' && (
            <Suspense fallback={<SettingsLoadingSkeleton />}>
              <RoleEditor />
            </Suspense>
          )}

          {tab === 'members' && (
            <Suspense fallback={<SettingsLoadingSkeleton />}>
              <RoleSettingsPanel />
            </Suspense>
          )}

          {tab === 'moderation' && (
            <Suspense fallback={<SettingsLoadingSkeleton />}>
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
            <Suspense fallback={<SettingsLoadingSkeleton />}>
              <AutoModPanel />
            </Suspense>
          )}

          {tab === 'bots' && (
            <Suspense fallback={<SettingsLoadingSkeleton />}>
              <BotSettingsPanel />
            </Suspense>
          )}

          {tab === 'webhooks' && (
            <Suspense fallback={<SettingsLoadingSkeleton />}>
              <WebhookManager />
            </Suspense>
          )}

          {tab === 'retention' && (
            <RetentionSettingsTab serverId={server.id} currentDays={server.default_message_retention_days ?? null} />
          )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Shared Components ---

function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-48 bg-sol-bg-elevated rounded-lg" />
      <div className="h-4 w-72 bg-sol-bg-elevated/50 rounded" />
      <div className="h-32 bg-sol-bg-elevated/30 rounded-xl" />
      <div className="h-32 bg-sol-bg-elevated/30 rounded-xl" />
    </div>
  )
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
      <h3 className="text-sm font-medium text-sol-text-primary mb-0.5">{title}</h3>
      {description && <p className="text-xs text-sol-text-muted mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  )
}

function SettingsToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-sol-text-secondary">{label}</p>
        <p className="text-xs text-sol-text-muted mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function SaveBar({ saving, disabled, onSave, onCancel, error }: { saving: boolean; disabled?: boolean; onSave: () => void; onCancel: () => void; error?: string }) {
  return (
    <div className="pt-4">
      {error && <p className="text-sm text-sol-coral mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-sol-text-muted hover:text-sol-text-primary transition-colors rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || disabled}
          className="px-5 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// --- General Tab ---

function GeneralTab({ server, name, setName, gifsEnabled, setGifsEnabled, saving, error, onSave, onClose }: {
  server: Server; name: string; setName: (v: string) => void; gifsEnabled: boolean; setGifsEnabled: (v: boolean) => void
  saving: boolean; error: string; onSave: () => void; onClose: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">General</h2>
        <p className="text-sm text-sol-text-muted">Configure your server's basic settings.</p>
      </div>

      <SettingsSection title="Server Identity">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Invite Code</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={server.invite_code}
                readOnly
                className="flex-1 bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-muted text-sm font-mono"
              />
              <button
                onClick={() => navigator.clipboard.writeText(server.invite_code)}
                className="px-4 py-2.5 bg-sol-bg-elevated text-sol-text-secondary rounded-lg hover:text-sol-amber transition-colors text-sm"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Features">
        <SettingsToggle
          label="GIFs"
          description="Allow members to send GIF messages in this server."
          checked={gifsEnabled}
          onChange={setGifsEnabled}
        />
      </SettingsSection>

      <SaveBar saving={saving} disabled={!name.trim()} onSave={onSave} onCancel={onClose} error={error} />

      <DangerZoneServerDelete server={server} onClose={onClose} />
    </div>
  )
}

// --- Visibility Tab ---

function VisibilityTab({ isPublic, setIsPublic, description, setDescription, saving, error, onSave, onClose }: {
  isPublic: boolean; setIsPublic: (v: boolean) => void; description: string; setDescription: (v: string) => void
  saving: boolean; error: string; onSave: () => void; onClose: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Visibility</h2>
        <p className="text-sm text-sol-text-muted">Control who can find and join your server.</p>
      </div>

      <SettingsSection title="Discoverability">
        <div className="space-y-4">
          <SettingsToggle
            label="Public Server"
            description="Allow anyone to find and join this server through Discover."
            checked={isPublic}
            onChange={setIsPublic}
          />
          <div>
            <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Description</label>
            <p className="text-xs text-sol-text-muted mb-2">A short description shown on the Discover page.</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Tell people what this server is about..."
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 resize-none transition-colors"
            />
            <p className="text-xs text-sol-text-muted mt-1 text-right font-mono">
              {description.length}/500
            </p>
          </div>
        </div>
      </SettingsSection>

      <SaveBar saving={saving} onSave={onSave} onCancel={onClose} error={error} />
    </div>
  )
}

// --- Retention Settings Tab ---

const RETENTION_OPTIONS = [
  { label: 'Forever (no auto-delete)', value: 0, badge: null },
  { label: '7 days', value: 7, badge: null },
  { label: '30 days', value: 30, badge: null },
  { label: '90 days', value: 90, badge: 'Popular' },
  { label: '180 days', value: 180, badge: null },
  { label: '365 days', value: 365, badge: null },
]

function RetentionSettingsTab({ serverId, currentDays }: { serverId: string; currentDays: number | null }) {
  const [retentionDays, setRetentionDays] = useState<number>(currentDays ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await serversApi.update(serverId, {
        default_message_retention_days: retentionDays === 0 ? null : retentionDays,
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save retention settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Message Retention</h2>
        <p className="text-sm text-sol-text-muted">Automatically delete messages older than the selected duration.</p>
      </div>

      <SettingsSection title="Default Retention Period" description="Messages older than this will be permanently deleted during the next cleanup cycle.">
        <div className="space-y-1">
          {RETENTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                retentionDays === opt.value
                  ? 'bg-sol-amber/10 border border-sol-amber/20'
                  : 'border border-transparent hover:bg-sol-bg-elevated/50'
              }`}
            >
              <input
                type="radio"
                name="retention"
                checked={retentionDays === opt.value}
                onChange={() => setRetentionDays(opt.value)}
                className="accent-sol-amber"
              />
              <span className={`text-sm ${retentionDays === opt.value ? 'text-sol-text-primary font-medium' : 'text-sol-text-secondary'}`}>{opt.label}</span>
              {opt.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sol-sage/15 text-sol-sage font-mono uppercase">{opt.badge}</span>
              )}
            </label>
          ))}
        </div>
      </SettingsSection>

      {retentionDays > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-xs text-sol-coral/80 leading-relaxed">
            Messages older than {retentionDays} days will be permanently deleted. This cannot be undone.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-sol-coral">{error}</p>}
      {success && <p className="text-sm text-sol-sage">Saved!</p>}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
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

  if (loading) return <SettingsLoadingSkeleton />

  const textChannels = channels.filter((c) => c.type === 'text')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Welcome Screen</h2>
        <p className="text-sm text-sol-text-muted">Greet new members when they join your server.</p>
      </div>

      <SettingsSection title="Welcome Message">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Write a welcome message for new members..."
          className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary focus:outline-none focus:border-sol-amber/40 resize-none text-sm transition-colors"
        />
      </SettingsSection>

      <SettingsSection title="Recommended Channels" description="Highlight channels that new members should visit first.">
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {textChannels.map((ch) => (
            <label
              key={ch.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedChannels.includes(ch.id)
                  ? 'bg-sol-amber/10'
                  : 'hover:bg-sol-bg-elevated/50'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedChannels.includes(ch.id)}
                onChange={() => toggleChannel(ch.id)}
                className="accent-sol-amber rounded"
              />
              <span className="text-sol-text-muted text-sm">#</span>
              <span className="text-sol-text-primary text-sm">{ch.name}</span>
            </label>
          ))}
        </div>
      </SettingsSection>

      {error && <p className="text-sm text-sol-coral">{error}</p>}
      {success && <p className="text-sm text-sol-sage">Saved!</p>}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
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

  if (loading) return <SettingsLoadingSkeleton />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-sol-text-primary mb-1">Onboarding</h2>
        <p className="text-sm text-sol-text-muted">
          Configure prompts that new members step through after joining. Each prompt can have options that assign roles.
        </p>
      </div>

      {prompts.map((prompt, pi) => (
        <div key={prompt.tempId} className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5 space-y-3">
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
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
          />

          <input
            type="text"
            placeholder="Description (optional)"
            value={prompt.description}
            onChange={(e) => updatePrompt(prompt.tempId, 'description', e.target.value)}
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
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
          <div className="space-y-2 pl-4 border-l-2 border-sol-bg-elevated">
            <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">Options</span>
            {prompt.options.map((opt) => (
              <div key={opt.tempId} className="flex items-start gap-2">
                <input
                  type="text"
                  placeholder="Emoji"
                  value={opt.emoji}
                  onChange={(e) => updateOption(prompt.tempId, opt.tempId, 'emoji', e.target.value)}
                  className="w-12 bg-sol-bg-tertiary border border-sol-bg-elevated rounded px-2 py-1.5 text-center text-sm focus:outline-none focus:border-sol-amber/30"
                />
                <input
                  type="text"
                  placeholder="Label"
                  value={opt.label}
                  onChange={(e) => updateOption(prompt.tempId, opt.tempId, 'label', e.target.value)}
                  className="flex-1 bg-sol-bg-tertiary border border-sol-bg-elevated rounded px-2 py-1.5 text-sm text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={opt.description}
                  onChange={(e) => updateOption(prompt.tempId, opt.tempId, 'description', e.target.value)}
                  className="flex-1 bg-sol-bg-tertiary border border-sol-bg-elevated rounded px-2 py-1.5 text-sm text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
                />
                <button
                  onClick={() => removeOption(prompt.tempId, opt.tempId)}
                  className="text-sol-coral/60 hover:text-sol-coral text-xs mt-1.5 transition-colors"
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
        className="w-full py-3 border border-dashed border-sol-bg-elevated rounded-xl text-sm text-sol-text-muted hover:text-sol-amber hover:border-sol-amber/30 transition-colors"
      >
        + Add Prompt
      </button>

      {error && <p className="text-sm text-sol-coral">{error}</p>}
      {success && <p className="text-sm text-sol-sage">Saved!</p>}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Onboarding'}
        </button>
      </div>
    </div>
  )
}

// --- Danger Zone: Delete Server ---

function DangerZoneServerDelete({ server, onClose }: { server: Server; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const deleteServer = useServerStore((s) => s.deleteServer)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  if (server.owner_id !== user?.id) return null

  const handleDelete = async () => {
    if (confirmName !== server.name) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteServer(server.id)
      onClose()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete server')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mt-6">
      <div className="border border-sol-coral/20 rounded-xl p-5 bg-sol-coral/[0.03]">
        <div className="flex items-center gap-2 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h4 className="text-sm font-medium text-sol-coral">Danger Zone</h4>
        </div>
        <p className="text-xs text-sol-text-muted mb-3 leading-relaxed">
          Deleting a server is irreversible. All channels, messages, and data will be permanently removed.
        </p>
        <p className="text-xs text-sol-text-secondary mb-2">
          Type <strong className="text-sol-text-primary font-mono">{server.name}</strong> to confirm.
        </p>
        <input
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder="Server name"
          className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-coral/30 mb-3 transition-colors"
        />
        {deleteError && <p className="text-sm text-sol-coral mb-2">{deleteError}</p>}
        <button
          onClick={handleDelete}
          disabled={confirmName !== server.name || deleting}
          className="px-4 py-2 bg-sol-coral/15 text-sol-coral rounded-lg hover:bg-sol-coral/25 disabled:opacity-40 transition-colors text-sm font-medium"
        >
          {deleting ? 'Deleting...' : 'Delete Server'}
        </button>
      </div>
    </div>
  )
}
