import { useState, useEffect, useCallback } from 'react'
import { useThemeStore, type Theme } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

type SettingsTab = 'account' | 'appearance'

const THEME_OPTIONS: { id: Theme; label: string; colors: { bg: string; secondary: string; amber: string; text: string } }[] = [
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    colors: { bg: 'rgb(20,30,19)', secondary: 'rgb(28,42,26)', amber: 'rgb(232,169,38)', text: 'rgb(232,224,208)' }
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    colors: { bg: 'rgb(253,246,227)', secondary: 'rgb(238,232,213)', amber: 'rgb(181,137,0)', text: 'rgb(7,54,66)' }
  },
  {
    id: 'nord',
    label: 'Nord',
    colors: { bg: 'rgb(46,52,64)', secondary: 'rgb(59,66,82)', amber: 'rgb(235,203,139)', text: 'rgb(236,239,244)' }
  }
]

interface SettingsOverlayProps {
  onClose: () => void
}

export default function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const [tab, setTab] = useState<SettingsTab>('account')
  const { theme, compactMode, setTheme, setCompactMode } = useThemeStore()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

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
    <div className="fixed inset-0 z-[100] flex bg-sol-bg">
      {/* Sidebar */}
      <div className="w-56 bg-sol-bg-secondary flex flex-col border-r border-sol-bg-elevated">
        <div className="p-4 pt-6">
          <h2 className="font-display text-xs font-bold text-sol-text-muted uppercase tracking-wider mb-3">
            User Settings
          </h2>
          <nav className="flex flex-col gap-0.5">
            <button
              onClick={() => setTab('account')}
              className={`text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                tab === 'account'
                  ? 'bg-sol-amber/20 text-sol-amber'
                  : 'text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-tertiary'
              }`}
            >
              My Account
            </button>
            <button
              onClick={() => setTab('appearance')}
              className={`text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                tab === 'appearance'
                  ? 'bg-sol-amber/20 text-sol-amber'
                  : 'text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-tertiary'
              }`}
            >
              Appearance
            </button>
          </nav>
        </div>

        <div className="flex-1" />

        <div className="p-4 border-t border-sol-bg-elevated">
          <button
            onClick={async () => {
              await logout()
              onClose()
            }}
            className="w-full text-left px-3 py-1.5 rounded-md text-sm text-sol-coral hover:bg-sol-coral/10 transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-12 relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full border border-sol-bg-elevated
                       flex items-center justify-center text-sol-text-muted hover:text-sol-text-primary
                       hover:border-sol-text-muted transition-colors"
            title="Close (Esc)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {tab === 'account' && (
            <div>
              <h1 className="font-display text-2xl text-sol-text-primary mb-6">My Account</h1>
              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6">
                <div className="flex items-center gap-4">
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.username}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-sol-amber/20 flex items-center justify-center">
                      <span className="font-display text-xl text-sol-amber">
                        {user?.username?.charAt(0).toUpperCase() ?? '?'}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-sol-text-primary font-medium text-lg">{user?.username}</p>
                    {user?.display_name && (
                      <p className="text-sol-text-secondary text-sm">{user.display_name}</p>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-sol-bg-elevated">
                  <p className="text-sol-text-secondary text-sm">
                    To edit your profile (display name, bio, avatar, pronouns, and status),
                    click your avatar in the bottom-left sidebar to open the profile popover.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div>
              <h1 className="font-display text-2xl text-sol-text-primary mb-6">Appearance</h1>

              {/* Theme selector */}
              <div className="mb-8">
                <h2 className="font-display text-sm font-bold text-sol-text-muted uppercase tracking-wider mb-3">
                  Theme
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setTheme(opt.id)}
                      className={`rounded-xl border-2 overflow-hidden transition-all duration-200 ${
                        theme === opt.id
                          ? 'border-sol-amber shadow-glow-amber'
                          : 'border-sol-bg-elevated hover:border-sol-text-muted'
                      }`}
                    >
                      {/* Swatch preview */}
                      <div
                        className="h-20 p-3 flex flex-col justify-between"
                        style={{ backgroundColor: opt.colors.bg }}
                      >
                        <div className="flex gap-1.5">
                          <div
                            className="w-8 h-2 rounded-full"
                            style={{ backgroundColor: opt.colors.amber }}
                          />
                          <div
                            className="w-5 h-2 rounded-full opacity-50"
                            style={{ backgroundColor: opt.colors.text }}
                          />
                        </div>
                        <div className="flex gap-1">
                          <div
                            className="flex-1 h-2 rounded"
                            style={{ backgroundColor: opt.colors.secondary }}
                          />
                          <div
                            className="flex-1 h-2 rounded"
                            style={{ backgroundColor: opt.colors.secondary }}
                          />
                        </div>
                      </div>
                      <div
                        className="px-3 py-2 text-sm font-medium text-center"
                        style={{ backgroundColor: opt.colors.secondary, color: opt.colors.text }}
                      >
                        {opt.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Compact mode */}
              <div>
                <h2 className="font-display text-sm font-bold text-sol-text-muted uppercase tracking-wider mb-3">
                  Chat Display
                </h2>
                <label className="flex items-center justify-between bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl px-4 py-3 cursor-pointer hover:border-sol-text-muted transition-colors">
                  <div>
                    <p className="text-sol-text-primary text-sm font-medium">Compact Mode</p>
                    <p className="text-sol-text-muted text-xs mt-0.5">
                      Reduce spacing between messages for a denser chat view
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={compactMode}
                      onChange={(e) => setCompactMode(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-sol-bg-elevated rounded-full peer-checked:bg-sol-amber/40 transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-sol-text-muted rounded-full peer-checked:translate-x-4 peer-checked:bg-sol-amber transition-all" />
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
