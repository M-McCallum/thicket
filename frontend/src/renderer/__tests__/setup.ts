import '@testing-library/jest-dom/vitest'

// Mock Electron preload API
Object.defineProperty(window, 'api', {
  value: {
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn()
  },
  writable: true
})

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()
