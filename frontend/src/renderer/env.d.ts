/// <reference types="vite/client" />

import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  const __APP_VERSION__: string
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
      notifications: {
        show: (payload: {
          title: string
          body: string
          context?:
            | { type: 'channel'; channelId: string; serverId: string }
            | { type: 'dm'; conversationId: string }
        }) => void
        setBadge: (payload: { totalUnread: number; totalMentions: number }) => void
        flash: () => void
        onClicked: (
          callback: (
            context:
              | { type: 'channel'; channelId: string; serverId: string }
              | { type: 'dm'; conversationId: string }
          ) => void
        ) => () => void
      }
      screen: {
        getSources: () => Promise<Array<{ id: string; name: string; thumbnailDataUrl: string }>>
      }
      updater: {
        checkForUpdates: () => Promise<void>
        downloadUpdate: () => Promise<void>
        installUpdate: () => Promise<void>
        onStatus: (callback: (data: Record<string, unknown>) => void) => () => void
      }
    }
  }
}
