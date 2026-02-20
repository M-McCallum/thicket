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
