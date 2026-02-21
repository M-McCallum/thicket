import { create } from 'zustand'
import { userPreferences } from '@/services/api'

export type Theme = 'solarized-dark' | 'solarized-light' | 'nord'

interface ThemeState {
  theme: Theme
  compactMode: boolean
  setTheme: (theme: Theme) => void
  setCompactMode: (compact: boolean) => void
  loadPreferences: () => Promise<void>
}

function applyTheme(theme: Theme) {
  document.body.className = document.body.className
    .replace(/theme-\S+/g, '')
    .trim()
  document.body.classList.add(`theme-${theme}`)
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'solarized-dark',
  compactMode: false,

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
    // Persist to backend, fire-and-forget
    userPreferences.update({ theme }).catch(() => {})
  },

  setCompactMode: (compactMode) => {
    set({ compactMode })
    userPreferences.update({ compact_mode: compactMode }).catch(() => {})
  },

  loadPreferences: async () => {
    try {
      const prefs = await userPreferences.get()
      const theme = (['solarized-dark', 'solarized-light', 'nord'] as Theme[]).includes(prefs.theme as Theme)
        ? (prefs.theme as Theme)
        : 'solarized-dark'
      applyTheme(theme)
      set({ theme, compactMode: prefs.compact_mode ?? false })
    } catch {
      // If the endpoint doesn't exist yet, just apply the default
      applyTheme(get().theme)
    }
  }
}))
