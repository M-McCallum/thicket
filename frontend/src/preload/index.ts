import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getWindowState: (): Promise<string> => ipcRenderer.invoke('get-window-state'),
  minimizeWindow: (): void => ipcRenderer.send('minimize-window'),
  maximizeWindow: (): void => ipcRenderer.send('maximize-window'),
  closeWindow: (): void => ipcRenderer.send('close-window'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),

  auth: {
    canEncrypt: (): Promise<boolean> => ipcRenderer.invoke('auth:can-encrypt'),
    getStorageBackend: (): Promise<string> => ipcRenderer.invoke('auth:get-storage-backend'),
    storeTokens: (tokens: Record<string, string>): Promise<void> =>
      ipcRenderer.invoke('auth:store-tokens', tokens),
    getTokens: (): Promise<Record<string, string | null>> =>
      ipcRenderer.invoke('auth:get-tokens'),
    clearTokens: (): Promise<void> => ipcRenderer.invoke('auth:clear-tokens'),
    onCallback: (callback: (url: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, url: string): void => callback(url)
      ipcRenderer.on('auth-callback', handler)
      return () => ipcRenderer.removeListener('auth-callback', handler)
    }
  },

  notifications: {
    show: (payload: {
      title: string
      body: string
      context?: { type: 'channel'; channelId: string; serverId: string } | { type: 'dm'; conversationId: string }
    }): void => ipcRenderer.send('notification:show', payload),
    setBadge: (payload: { totalUnread: number; totalMentions: number }): void =>
      ipcRenderer.send('notification:set-badge', payload),
    flash: (): void => ipcRenderer.send('notification:flash'),
    onClicked: (
      callback: (
        context: { type: 'channel'; channelId: string; serverId: string } | { type: 'dm'; conversationId: string }
      ) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        context: { type: 'channel'; channelId: string; serverId: string } | { type: 'dm'; conversationId: string }
      ): void => callback(context)
      ipcRenderer.on('notification:clicked', handler)
      return () => ipcRenderer.removeListener('notification:clicked', handler)
    }
  },

  screen: {
    getSources: (): Promise<Array<{ id: string; name: string; thumbnailDataUrl: string }>> =>
      ipcRenderer.invoke('screen:get-sources'),
    hasFollowSupport: (): Promise<boolean> =>
      ipcRenderer.invoke('screen:has-follow-support'),
    startFollowing: (sourceId: string): Promise<boolean> =>
      ipcRenderer.invoke('screen:start-following', sourceId),
    stopFollowing: (): Promise<boolean> =>
      ipcRenderer.invoke('screen:stop-following'),
    switchToSource: (newSourceId: string): Promise<boolean> =>
      ipcRenderer.invoke('screen:switch-to-source', newSourceId),
    onSourceSwitched: (callback: (data: { sourceId: string; windowName: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sourceId: string; windowName: string }): void => callback(data)
      ipcRenderer.on('screen:source-switched', handler)
      return () => ipcRenderer.removeListener('screen:source-switched', handler)
    },
    onNewWindowDetected: (callback: (data: { sourceId: string; windowName: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { sourceId: string; windowName: string }): void => callback(data)
      ipcRenderer.on('screen:new-window-detected', handler)
      return () => ipcRenderer.removeListener('screen:new-window-detected', handler)
    },
    onFollowedAppClosed: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('screen:followed-app-closed', handler)
      return () => ipcRenderer.removeListener('screen:followed-app-closed', handler)
    }
  },

  invite: {
    onInviteLink: (callback: (code: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, code: string): void => callback(code)
      ipcRenderer.on('invite-link', handler)
      return () => ipcRenderer.removeListener('invite-link', handler)
    }
  },

  updater: {
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    setAutoDownload: (v: boolean): Promise<void> => ipcRenderer.invoke('updater:set-auto-download', v),
    onStatus: (callback: (data: Record<string, unknown>) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>): void =>
        callback(data)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
