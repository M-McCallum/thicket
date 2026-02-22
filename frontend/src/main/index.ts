import { app, BrowserWindow, desktopCapturer, ipcMain, safeStorage, session, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { setupNotifications } from './notifications'
import Store from 'electron-store'

const store = new Store<Record<string, string>>({ name: 'auth-tokens' })

// Derive API origin for CSP from the same env var the renderer uses
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
const apiOrigin = new URL(apiUrl).origin

let mainWindow: BrowserWindow | null = null

// Register thicket:// custom protocol for OAuth callbacks
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('thicket', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('thicket')
}

function handleProtocolUrl(url: string): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()

  try {
    const parsed = new URL(url)
    // thicket://invite/{code}
    const pathParts = parsed.pathname.replace(/^\/+/, '').split('/')
    if (parsed.host === 'invite' || (pathParts.length >= 1 && pathParts[0] === 'invite')) {
      const code = parsed.host === 'invite' ? pathParts[0] : pathParts[1]
      if (code) {
        mainWindow.webContents.send('invite-link', code)
        return
      }
    }
  } catch {
    // Not a valid URL, fall through to auth callback
  }

  mainWindow.webContents.send('auth-callback', url)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#141e13',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// macOS: handle thicket:// URLs via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

// Windows/Linux: handle thicket:// URLs via second-instance event
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith('thicket://'))
    if (url) {
      handleProtocolUrl(url)
    }
  })
}

// GPU and V8 optimizations
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('land.mitchell.thicket')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // safeStorage IPC handlers
  ipcMain.handle('auth:can-encrypt', () => {
    return safeStorage.isEncryptionAvailable()
  })

  ipcMain.handle('auth:get-storage-backend', () => {
    return safeStorage.getSelectedStorageBackend()
  })

  ipcMain.handle('auth:store-tokens', (_event, tokens: Record<string, string>) => {
    for (const [key, value] of Object.entries(tokens)) {
      const encrypted = safeStorage.encryptString(value)
      store.set(key, encrypted.toString('base64'))
    }
  })

  ipcMain.handle('auth:get-tokens', () => {
    const keys = ['access_token', 'refresh_token', 'id_token']
    const result: Record<string, string | null> = {}
    for (const key of keys) {
      const encrypted = store.get(key)
      if (encrypted) {
        const buffer = Buffer.from(encrypted, 'base64')
        result[key] = safeStorage.decryptString(buffer)
      } else {
        result[key] = null
      }
    }
    return result
  })

  ipcMain.handle('auth:clear-tokens', () => {
    store.clear()
  })

  ipcMain.handle('open-external', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('screen:get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 }
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataUrl: s.thumbnail.toDataURL()
    }))
  })

  // Set CSP dynamically so the API origin works in both dev and production
  const devServerOrigin = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? new URL(process.env['ELECTRON_RENDERER_URL']).origin
    : null
  const wsScheme = apiOrigin.startsWith('https') ? 'wss' : 'ws'
  const wsOrigin = apiOrigin.replace(/^https?/, wsScheme)
  const livekitUrl = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'
  const livekitOrigin = new URL(livekitUrl).origin
  const livekitWsOrigin = livekitOrigin.replace(/^https?/, wsScheme)
  const oidcAuthority = import.meta.env.VITE_OIDC_AUTHORITY || 'http://localhost:4444'
  const oidcOrigin = new URL(oidcAuthority).origin
  const devSrc = devServerOrigin ? ` ${devServerOrigin}` : ''
  const csp = [
    `default-src 'self'${devSrc}`,
    `script-src 'self'${devSrc}${devServerOrigin ? " 'unsafe-inline'" : ''} blob:`,
    `style-src 'self'${devSrc} 'unsafe-inline'`,
    `font-src 'self'${devSrc}`,
    `img-src 'self' ${apiOrigin} https://*.giphy.com data: blob:`,
    `media-src 'self' ${apiOrigin} blob: mediastream:`,
    `connect-src 'self' ${apiOrigin} ${wsOrigin} ${oidcOrigin}${devSrc ? ` ${devServerOrigin!.replace('http', 'ws')}` : ''} ${livekitWsOrigin} ${livekitOrigin} wss://*.livekit.cloud https://*.turn.livekit.cloud https://global.stun.twilio.com`,
    "frame-ancestors 'none'"
  ].join('; ')

  // Grant media permissions (microphone, camera, screen capture) to the renderer
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem'].includes(permission)
    console.log(`[Permission] ${permission} → ${allowed ? 'granted' : 'denied'}`)
    callback(allowed)
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem'].includes(permission)
    return allowed
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Only apply CSP to document/page navigations — not to WS upgrades, XHR, or
    // external requests (e.g. presigned MinIO URLs).  Applying CSP to WebSocket
    // upgrade responses can break WS connections on Windows Electron builds.
    const isPage = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
    if (isPage) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      })
    } else {
      callback({ responseHeaders: details.responseHeaders })
    }
  })

  createWindow()
  if (mainWindow) setupAutoUpdater(mainWindow)
  if (mainWindow) setupNotifications(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function setupAutoUpdater(win: BrowserWindow): void {
  if (is.dev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  function sendStatus(data: Record<string, unknown>): void {
    win.webContents.send('updater:status', data)
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    sendStatus({ status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({ status: 'downloading', percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', () => {
    sendStatus({ status: 'ready' })
  })

  autoUpdater.on('error', (err) => {
    sendStatus({ status: 'error', errorMessage: err.message })
  })

  ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates())
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('updater:install', () => {
    setImmediate(() => {
      app.removeAllListeners('window-all-closed')
      BrowserWindow.getAllWindows().forEach((w) => w.destroy())
      autoUpdater.quitAndInstall(false, true)
    })
  })
  ipcMain.handle('updater:set-auto-download', (_event, v: boolean) => {
    autoUpdater.autoDownload = v
  })

  setTimeout(() => autoUpdater.checkForUpdates(), 5000)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
