import '@testing-library/jest-dom/vitest'

// Mock Electron preload API
Object.defineProperty(window, 'api', {
  value: {
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    auth: {
      canEncrypt: vi.fn().mockResolvedValue(true),
      getStorageBackend: vi.fn().mockResolvedValue('keychain'),
      storeTokens: vi.fn().mockResolvedValue(undefined),
      getTokens: vi.fn().mockResolvedValue({ access_token: null, refresh_token: null, id_token: null }),
      clearTokens: vi.fn().mockResolvedValue(undefined),
      onCallback: vi.fn().mockReturnValue(() => {})
    }
  },
  writable: true
})

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()
