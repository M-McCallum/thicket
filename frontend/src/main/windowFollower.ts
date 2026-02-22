import { BrowserWindow, desktopCapturer, ipcMain } from 'electron'

// Try to load the native addon — gracefully returns null if unavailable
interface WindowUtils {
  getWindowPid(windowId: number): number
  getWindowsForPid(pid: number): Array<{ windowId: number; title: string }>
}

let windowUtils: WindowUtils | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  windowUtils = require('../../native/window-utils')
} catch {
  console.log('[WindowFollower] Native addon not available — follow-window disabled')
}

// ─── State ───────────────────────────────────────────────────────────

let followPid: number | null = null
let currentWindowId: number | null = null
let currentSourceId: string | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extract numeric window ID from Electron source ID like "window:12345:0" */
function parseWindowId(sourceId: string): number | null {
  const match = sourceId.match(/^window:(\d+):/)
  return match ? parseInt(match[1], 10) : null
}

/** Find desktop capturer sources matching our tracked PID */
async function getCapturableWindowsForPid(
  pid: number
): Promise<Array<{ sourceId: string; windowId: number; name: string }>> {
  if (!windowUtils) return []

  const pidWindows = windowUtils.getWindowsForPid(pid)
  if (pidWindows.length === 0) return []

  const pidWindowIds = new Set(pidWindows.map((w) => w.windowId))

  // Get sources with tiny thumbnails for speed
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1, height: 1 }
  })

  const result: Array<{ sourceId: string; windowId: number; name: string }> = []
  for (const source of sources) {
    const wid = parseWindowId(source.id)
    if (wid !== null && pidWindowIds.has(wid)) {
      result.push({ sourceId: source.id, windowId: wid, name: source.name })
    }
  }
  return result
}

// ─── Core Logic ──────────────────────────────────────────────────────

function startFollowing(sourceId: string, win: BrowserWindow): boolean {
  if (!windowUtils) return false

  const windowId = parseWindowId(sourceId)
  if (windowId === null) return false

  const pid = windowUtils.getWindowPid(windowId)
  if (pid <= 0) return false

  followPid = pid
  currentWindowId = windowId
  currentSourceId = sourceId

  stopPolling()
  pollTimer = setInterval(() => pollForWindowChange(win), 2000)
  return true
}

async function pollForWindowChange(win: BrowserWindow): Promise<void> {
  if (!followPid || !windowUtils) return
  if (win.isDestroyed()) {
    stopFollowing()
    return
  }

  const capturableWindows = await getCapturableWindowsForPid(followPid)

  const currentStillExists = capturableWindows.some((w) => w.windowId === currentWindowId)
  const otherWindows = capturableWindows.filter((w) => w.windowId !== currentWindowId)

  if (!currentStillExists && otherWindows.length > 0) {
    // Original window closed, new window appeared — auto-switch
    const newWindow = otherWindows[0]
    currentWindowId = newWindow.windowId
    currentSourceId = newWindow.sourceId
    win.webContents.send('screen:source-switched', {
      sourceId: newWindow.sourceId,
      windowName: newWindow.name
    })
  } else if (currentStillExists && otherWindows.length > 0) {
    // Both exist — notify renderer about the new window
    const newWindow = otherWindows[0]
    win.webContents.send('screen:new-window-detected', {
      sourceId: newWindow.sourceId,
      windowName: newWindow.name
    })
  } else if (capturableWindows.length === 0) {
    // All windows from this PID are gone
    win.webContents.send('screen:followed-app-closed')
    stopFollowing()
  }
}

function stopFollowing(): void {
  stopPolling()
  followPid = null
  currentWindowId = null
  currentSourceId = null
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// ─── IPC Registration ────────────────────────────────────────────────

export function setupFollowWindowIPC(): void {
  ipcMain.handle('screen:start-following', (event, sourceId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    return startFollowing(sourceId, win)
  })

  ipcMain.handle('screen:stop-following', () => {
    stopFollowing()
    return true
  })

  ipcMain.handle('screen:switch-to-source', (_event, newSourceId: string) => {
    // Update tracking to the new source (called after renderer switches)
    const windowId = parseWindowId(newSourceId)
    if (windowId !== null) {
      currentWindowId = windowId
      currentSourceId = newSourceId
    }
    return true
  })

  ipcMain.handle('screen:has-follow-support', () => {
    return windowUtils !== null
  })
}
