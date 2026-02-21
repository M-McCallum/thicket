import { create } from 'zustand'
import { userPreferences } from '@/services/api'

export type ThemeName = 'solarized-dark' | 'solarized-light' | 'nord' | 'amoled'

const VALID_THEMES: ThemeName[] = ['solarized-dark', 'solarized-light', 'nord', 'amoled']

const CUSTOM_CSS_KEY = 'thicket_custom_css'
const FONT_SIZE_KEY = 'thicket_font_size'
const REDUCED_MOTION_KEY = 'thicket_reduced_motion'

interface ThemeState {
  theme: ThemeName
  fontSize: number
  compactMode: boolean
  reducedMotion: boolean
  customCSS: string
  settingsOpen: boolean

  setTheme: (theme: ThemeName) => void
  setFontSize: (size: number) => void
  setCompactMode: (compact: boolean) => void
  setReducedMotion: (reduced: boolean) => void
  setCustomCSS: (css: string) => void
  openSettings: () => void
  closeSettings: () => void
  initTheme: () => void
  loadPreferences: () => Promise<void>
}

function applyThemeClass(theme: ThemeName) {
  const body = document.body
  body.classList.remove('theme-solarized-dark', 'theme-solarized-light', 'theme-nord', 'theme-amoled')
  body.classList.add(`theme-${theme}`)
}

function applyFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`
}

function applyReducedMotion(reduced: boolean) {
  if (reduced) {
    document.documentElement.classList.add('reduce-motion')
  } else {
    document.documentElement.classList.remove('reduce-motion')
  }
}

function injectCustomCSS(css: string) {
  let style = document.getElementById('thicket-custom-css') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'thicket-custom-css'
    document.head.appendChild(style)
  }
  style.textContent = css
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'solarized-dark',
  fontSize: 16,
  compactMode: false,
  reducedMotion: false,
  customCSS: '',
  settingsOpen: false,

  setTheme: (theme) => {
    applyThemeClass(theme)
    set({ theme })
    // Persist to backend, fire-and-forget
    userPreferences.update({ theme }).catch(() => {})
  },

  setFontSize: (size) => {
    localStorage.setItem(FONT_SIZE_KEY, String(size))
    applyFontSize(size)
    set({ fontSize: size })
  },

  setCompactMode: (compactMode) => {
    set({ compactMode })
    userPreferences.update({ compact_mode: compactMode }).catch(() => {})
  },

  setReducedMotion: (reduced) => {
    localStorage.setItem(REDUCED_MOTION_KEY, String(reduced))
    applyReducedMotion(reduced)
    set({ reducedMotion: reduced })
  },

  setCustomCSS: (css) => {
    localStorage.setItem(CUSTOM_CSS_KEY, css)
    injectCustomCSS(css)
    set({ customCSS: css })
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  initTheme: () => {
    // Load local-only settings from localStorage
    const savedFontSize = Number(localStorage.getItem(FONT_SIZE_KEY)) || 16
    const savedReducedMotion = localStorage.getItem(REDUCED_MOTION_KEY) === 'true'
    const savedCustomCSS = localStorage.getItem(CUSTOM_CSS_KEY) || ''

    applyFontSize(savedFontSize)
    applyReducedMotion(savedReducedMotion)
    injectCustomCSS(savedCustomCSS)
    // Apply default theme class until loadPreferences completes
    applyThemeClass(get().theme)

    set({
      fontSize: savedFontSize,
      reducedMotion: savedReducedMotion,
      customCSS: savedCustomCSS,
    })
  },

  loadPreferences: async () => {
    try {
      const prefs = await userPreferences.get()
      const theme = VALID_THEMES.includes(prefs.theme as ThemeName)
        ? (prefs.theme as ThemeName)
        : 'solarized-dark'
      applyThemeClass(theme)
      set({ theme, compactMode: prefs.compact_mode ?? false })
    } catch {
      // If the endpoint doesn't exist yet, just apply the default
      applyThemeClass(get().theme)
    }
  },
}))
