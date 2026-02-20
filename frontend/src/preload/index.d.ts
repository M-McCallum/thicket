import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getWindowState: () => Promise<string>
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      openExternal: (url: string) => Promise<void>
      auth: {
        canEncrypt: () => Promise<boolean>
        getStorageBackend: () => Promise<string>
        storeTokens: (tokens: Record<string, string>) => Promise<void>
        getTokens: () => Promise<Record<string, string | null>>
        clearTokens: () => Promise<void>
        onCallback: (callback: (url: string) => void) => () => void
      }
    }
  }
}
