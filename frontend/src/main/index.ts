import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

const store = new Store<Record<string, string>>({ name: 'auth-tokens' })

// Derive API origin for CSP from the same env var the renderer uses
const apiUrl = process.env['VITE_API_URL'] || 'http://localhost:8080/api'
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

function handleAuthCallback(url: string): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('auth-callback', url)
  }
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
  handleAuthCallback(url)
})

// Windows/Linux: handle thicket:// URLs via second-instance event
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith('thicket://'))
    if (url) {
      handleAuthCallback(url)
    }
  })
}

// GPU and V8 optimizations
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.thicket')

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

  // Set CSP dynamically so the API origin works in both dev and production
  const devServerOrigin = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? new URL(process.env['ELECTRON_RENDERER_URL']).origin
    : null
  const wsScheme = apiOrigin.startsWith('https') ? 'wss' : 'ws'
  const wsOrigin = apiOrigin.replace(/^https?/, wsScheme)
  const livekitUrl = process.env['VITE_LIVEKIT_URL'] || 'ws://localhost:7880'
  const livekitOrigin = new URL(livekitUrl).origin
  const livekitWsOrigin = livekitOrigin.replace(/^https?/, wsScheme)
  const devSrc = devServerOrigin ? ` ${devServerOrigin}` : ''
  const csp = [
    `default-src 'self'${devSrc}`,
    `script-src 'self'${devSrc}${devServerOrigin ? " 'unsafe-inline'" : ''} blob:`,
    `style-src 'self'${devSrc} 'unsafe-inline'`,
    `font-src 'self'${devSrc}`,
    `img-src 'self' ${apiOrigin} https://*.giphy.com data: blob:`,
    `media-src 'self' ${apiOrigin} blob: mediastream:`,
    `connect-src 'self' ${apiOrigin} ${wsOrigin}${devSrc ? ` ${devServerOrigin!.replace('http', 'ws')}` : ''} ${livekitWsOrigin} ${livekitOrigin} wss://*.livekit.cloud https://*.turn.livekit.cloud https://global.stun.twilio.com`,
    "frame-ancestors 'none'"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
