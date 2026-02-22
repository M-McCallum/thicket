import { useState, useEffect, useCallback, useRef } from 'react'
import { useThemeStore, type ThemeName } from '@renderer/stores/themeStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useUpdateStore } from '@renderer/stores/updateStore'

type SettingsTab = 'account' | 'appearance'

const THEME_OPTIONS: { id: ThemeName; label: string; description: string; colors: { bg: string; secondary: string; amber: string; text: string } }[] = [
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    description: 'Forest tones with warm amber accents',
    colors: { bg: 'rgb(20,30,19)', secondary: 'rgb(28,42,26)', amber: 'rgb(232,169,38)', text: 'rgb(232,224,208)' }
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    description: 'Warm light theme with easy contrast',
    colors: { bg: 'rgb(253,246,227)', secondary: 'rgb(238,232,213)', amber: 'rgb(181,137,0)', text: 'rgb(7,54,66)' }
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Arctic, north-bluish color palette',
    colors: { bg: 'rgb(46,52,64)', secondary: 'rgb(59,66,82)', amber: 'rgb(235,203,139)', text: 'rgb(236,239,244)' }
  },
  {
    id: 'amoled',
    label: 'AMOLED Dark',
    description: 'Pure black for OLED displays',
    colors: { bg: 'rgb(0,0,0)', secondary: 'rgb(10,10,10)', amber: 'rgb(255,179,0)', text: 'rgb(220,220,220)' }
  }
]

const TAB_ITEMS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'account', label: 'My Account',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  {
    id: 'appearance', label: 'Appearance',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  },
]

export default function SettingsOverlay() {
  const settingsOpen = useThemeStore((s) => s.settingsOpen)
  const closeSettings = useThemeStore((s) => s.closeSettings)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const fontSize = useThemeStore((s) => s.fontSize)
  const setFontSize = useThemeStore((s) => s.setFontSize)
  const compactMode = useThemeStore((s) => s.compactMode)
  const setCompactMode = useThemeStore((s) => s.setCompactMode)
  const reducedMotion = useThemeStore((s) => s.reducedMotion)
  const setReducedMotion = useThemeStore((s) => s.setReducedMotion)
  const customCSS = useThemeStore((s) => s.customCSS)
  const setCustomCSS = useThemeStore((s) => s.setCustomCSS)

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [tab, setTab] = useState<SettingsTab>('account')
  const [localCSS, setLocalCSS] = useState(customCSS)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync localCSS when store changes (e.g., on open)
  useEffect(() => {
    setLocalCSS(customCSS)
  }, [customCSS])

  const handleCSSChange = useCallback(
    (value: string) => {
      setLocalCSS(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setCustomCSS(value)
      }, 500)
    },
    [setCustomCSS]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings()
    },
    [closeSettings]
  )

  useEffect(() => {
    if (!settingsOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [settingsOpen, handleKeyDown])

  if (!settingsOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex bg-sol-bg" role="dialog" aria-label="User Settings">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 bg-sol-bg-secondary flex-col border-r border-sol-bg-elevated overflow-y-auto">
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-sol-amber/15 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-amber">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-sol-text-primary truncate">{user?.username ?? 'Settings'}</p>
              <p className="text-[11px] text-sol-text-muted font-mono uppercase tracking-wider">User Settings</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 pb-3">
          {TAB_ITEMS.map((t) => (
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
        </nav>

        <div className="p-3 border-t border-sol-bg-elevated space-y-0.5">
          <button
            onClick={async () => {
              await logout()
              closeSettings()
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-sol-coral hover:bg-sol-coral/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log Out
          </button>
          <button
            onClick={closeSettings}
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
            {TAB_ITEMS.map((t) => (
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
            onClick={async () => {
              await logout()
              closeSettings()
            }}
            className="shrink-0 px-2 py-1.5 rounded-md text-xs text-sol-coral hover:bg-sol-coral/10 transition-colors"
          >
            Log Out
          </button>
          <button
            onClick={closeSettings}
            className="shrink-0 p-2 mr-2 text-sol-text-muted hover:text-sol-text-primary transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 lg:px-8 lg:py-8 relative">
            {/* Desktop close button */}
            <button
              onClick={closeSettings}
              className="hidden lg:flex absolute top-4 right-4 w-9 h-9 rounded-full border border-sol-bg-elevated
                         items-center justify-center text-sol-text-muted hover:text-sol-text-primary
                         hover:border-sol-text-muted transition-colors"
              title="Close (Esc)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {tab === 'account' && (
              <div className="max-w-lg space-y-5">
                <div>
                  <h2 className="text-lg font-medium text-sol-text-primary mb-1">My Account</h2>
                  <p className="text-sm text-sol-text-muted">Your profile and account information.</p>
                </div>

                <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
                  <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-4">Profile</h4>
                  <div className="flex items-center gap-4">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.username}
                        className="w-16 h-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-sol-amber/15 flex items-center justify-center">
                        <span className="font-display text-xl font-bold text-sol-amber">
                          {user?.username?.charAt(0).toUpperCase() ?? '?'}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sol-text-primary font-medium text-base">{user?.display_name || user?.username}</p>
                      {user?.display_name && user.display_name !== user.username && (
                        <p className="text-sol-text-muted text-sm">@{user.username}</p>
                      )}
                      {user?.pronouns && (
                        <p className="text-xs text-sol-text-muted/60 mt-0.5">{user.pronouns}</p>
                      )}
                    </div>
                  </div>

                  {user?.bio && (
                    <div className="mt-4 pt-4 border-t border-sol-bg-elevated">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-1">About Me</p>
                      <p className="text-sm text-sol-text-secondary whitespace-pre-wrap">{user.bio}</p>
                    </div>
                  )}
                </div>

                <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <p className="text-sm text-sol-text-secondary leading-relaxed">
                      To edit your profile (display name, bio, avatar, pronouns, and status),
                      click your avatar in the bottom-left sidebar to open the profile popover.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="max-w-lg space-y-5">
                <div>
                  <h2 className="text-lg font-medium text-sol-text-primary mb-1">Appearance</h2>
                  <p className="text-sm text-sol-text-muted">Customize how Thicket looks and feels.</p>
                </div>

                {/* Theme selector */}
                <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
                  <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-4">Theme</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setTheme(opt.id)}
                        className={`rounded-xl border-2 overflow-hidden transition-all duration-200 text-left ${
                          theme === opt.id
                            ? 'border-sol-amber shadow-glow-amber'
                            : 'border-sol-bg-elevated hover:border-sol-text-muted/30'
                        }`}
                      >
                        <div
                          className="h-16 p-3 flex flex-col justify-between"
                          style={{ backgroundColor: opt.colors.bg }}
                        >
                          <div className="flex gap-1.5">
                            <div
                              className="w-8 h-1.5 rounded-full"
                              style={{ backgroundColor: opt.colors.amber }}
                            />
                            <div
                              className="w-5 h-1.5 rounded-full opacity-40"
                              style={{ backgroundColor: opt.colors.text }}
                            />
                          </div>
                          <div className="flex gap-1">
                            <div
                              className="flex-1 h-1.5 rounded"
                              style={{ backgroundColor: opt.colors.secondary }}
                            />
                            <div
                              className="flex-1 h-1.5 rounded"
                              style={{ backgroundColor: opt.colors.secondary }}
                            />
                          </div>
                        </div>
                        <div
                          className="px-3 py-2"
                          style={{ backgroundColor: opt.colors.secondary, color: opt.colors.text }}
                        >
                          <div className="text-xs font-medium">{opt.label}</div>
                          <div className="text-[10px] opacity-50 mt-0.5">{opt.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
                  <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-4">Font Size</h4>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-sol-text-muted">A</span>
                    <input
                      type="range"
                      min={12}
                      max={20}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="flex-1 accent-sol-amber"
                    />
                    <span className="text-lg text-sol-text-muted">A</span>
                    <span className="text-xs text-sol-text-secondary w-10 text-right font-mono">{fontSize}px</span>
                  </div>
                </div>

                {/* Chat Display */}
                <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
                  <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-4">Chat Display</h4>
                  <SettingsToggle
                    label="Compact Mode"
                    description="Reduce spacing between messages for a denser chat view."
                    checked={compactMode}
                    onChange={setCompactMode}
                  />
                </div>

                {/* Accessibility */}
                <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
                  <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-4">Accessibility</h4>
                  <SettingsToggle
                    label="Reduced Motion"
                    description="Minimize animations throughout the app."
                    checked={reducedMotion}
                    onChange={setReducedMotion}
                  />
                </div>

                {/* Custom CSS */}
                <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
                  <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-3">Custom CSS</h4>
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-sol-coral/5 border border-sol-coral/15 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0 mt-0.5">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="text-xs text-sol-coral/80 leading-relaxed">
                      Custom CSS can break your layout or cause visual issues. Use at your own risk.
                    </p>
                  </div>
                  <textarea
                    value={localCSS}
                    onChange={(e) => handleCSSChange(e.target.value)}
                    placeholder={`/* Example: change accent color */\n:root {\n  --sol-amber: 255 100 50;\n}`}
                    className="w-full h-40 px-3 py-2 bg-sol-bg-tertiary border border-sol-bg-elevated text-sol-text-primary
                               placeholder-sol-text-muted font-mono text-xs rounded-lg resize-y
                               focus:border-sol-amber/40 focus:outline-none transition-colors"
                    spellCheck={false}
                  />
                </div>

                {/* Updates */}
                <UpdatesSection />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function UpdatesSection() {
  const autoDownload = useUpdateStore((s) => s.autoDownload)
  const setAutoDownload = useUpdateStore((s) => s.setAutoDownload)
  const status = useUpdateStore((s) => s.status)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)

  const statusLabel =
    status === 'checking' ? 'Checking for updates…' :
    status === 'up-to-date' ? "You're up to date." :
    status === 'available' ? 'Update available!' :
    status === 'downloading' ? 'Downloading update…' :
    status === 'ready' ? 'Update ready — restart to apply.' :
    status === 'error' ? 'Failed to check for updates.' :
    null

  return (
    <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-5">
      <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-4">Updates</h4>
      <div className="space-y-4">
        <SettingsToggle
          label="Auto-download updates"
          description="Automatically download updates in the background when available."
          checked={autoDownload}
          onChange={setAutoDownload}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={checkForUpdates}
            disabled={status === 'checking'}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sol-bg-tertiary border border-sol-bg-elevated
                       text-sol-text-secondary hover:text-sol-text-primary hover:border-sol-amber/30
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
          {statusLabel && (
            <span className={`text-xs ${status === 'error' ? 'text-sol-coral' : 'text-sol-text-muted'}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>
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
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
