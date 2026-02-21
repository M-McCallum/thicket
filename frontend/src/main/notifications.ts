import { app, BrowserWindow, ipcMain, nativeImage, Notification, Tray, Menu } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let tray: Tray | null = null
let hasUnread = false

interface ShowPayload {
  title: string
  body: string
  context?: { type: 'channel'; channelId: string; serverId: string } | { type: 'dm'; conversationId: string }
}

interface BadgePayload {
  totalUnread: number
  totalMentions: number
}

function getResourcePath(filename: string): string {
  if (is.dev) {
    return join(__dirname, '../../resources', filename)
  }
  return join(process.resourcesPath, filename)
}

function createTray(mainWindow: BrowserWindow): void {
  const iconName =
    process.platform === 'darwin' ? 'tray-iconTemplate.png' : 'tray-icon.png'
  const iconPath = getResourcePath(iconName)
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon)
  tray.setToolTip('Thicket')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Thicket',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow.show()
    }
  })
}

function updateTrayIcon(unread: boolean): void {
  if (!tray || hasUnread === unread) return
  hasUnread = unread

  const iconName = process.platform === 'darwin'
    ? (unread ? 'tray-icon-unreadTemplate.png' : 'tray-iconTemplate.png')
    : (unread ? 'tray-icon-unread.png' : 'tray-icon.png')

  const icon = nativeImage.createFromPath(getResourcePath(iconName))
  tray.setImage(icon)
}

export function setupNotifications(mainWindow: BrowserWindow): void {
  createTray(mainWindow)

  // Show a native notification
  ipcMain.on('notification:show', (_event, payload: ShowPayload) => {
    if (!Notification.isSupported()) return

    const notif = new Notification({
      title: payload.title,
      body: payload.body,
      icon: getResourcePath('icon.png'),
      silent: true // sound handled by renderer
    })

    notif.on('click', () => {
      mainWindow.show()
      mainWindow.focus()
      if (payload.context) {
        mainWindow.webContents.send('notification:clicked', payload.context)
      }
    })

    notif.show()
  })

  // Update dock/taskbar badge
  ipcMain.on('notification:set-badge', (_event, payload: BadgePayload) => {
    const { totalUnread, totalMentions } = payload

    // macOS dock badge
    if (process.platform === 'darwin') {
      app.dock.setBadge(totalMentions > 0 ? String(totalMentions) : totalUnread > 0 ? '•' : '')
    }

    // Windows taskbar overlay
    if (process.platform === 'win32') {
      if (totalMentions > 0 || totalUnread > 0) {
        const label = totalMentions > 0 ? String(totalMentions) : '•'
        // Create a simple badge overlay using nativeImage
        const canvas = nativeImage.createFromBuffer(createBadgeBuffer(label))
        mainWindow.setOverlayIcon(canvas, `${totalUnread} unread`)
      } else {
        mainWindow.setOverlayIcon(null, '')
      }
    }

    // Update tray icon
    updateTrayIcon(totalUnread > 0)
  })

  // Flash taskbar / bounce dock
  ipcMain.on('notification:flash', () => {
    if (process.platform === 'darwin') {
      app.dock.bounce('informational')
    } else {
      mainWindow.flashFrame(true)
    }
  })
}

/** Create a minimal 16x16 red badge PNG buffer for Windows overlay icon */
function createBadgeBuffer(label: string): Buffer {
  // Minimal 16x16 RGBA PNG with red circle
  // For simplicity, just create a solid red 16x16 image
  const width = 16
  const height = 16

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0) // length
  ihdr.write('IHDR', 4)
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[16] = 8 // bit depth
  ihdr[17] = 6 // color type RGBA
  ihdr[18] = 0 // compression
  ihdr[19] = 0 // filter
  ihdr[20] = 0 // interlace
  const ihdrCrc = crc32(ihdr.subarray(4, 21))
  ihdr.writeInt32BE(ihdrCrc, 21)

  // IDAT chunk - simple uncompressed raw pixel data
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    rawData[rowOffset] = 0 // filter none
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4
      // Simple circle mask
      const dx = x - 7.5
      const dy = y - 7.5
      const inCircle = dx * dx + dy * dy <= 7.5 * 7.5
      rawData[px] = inCircle ? 239 : 0     // R
      rawData[px + 1] = inCircle ? 68 : 0  // G
      rawData[px + 2] = inCircle ? 68 : 0  // B
      rawData[px + 3] = inCircle ? 255 : 0 // A
    }
  }

  // Deflate the raw data (use zlib-style uncompressed blocks)
  const deflated = deflateUncompressed(rawData)
  const idatPayload = Buffer.concat([Buffer.from('IDAT'), deflated])
  const idatLen = Buffer.alloc(4)
  idatLen.writeUInt32BE(deflated.length, 0)
  const idatCrc = Buffer.alloc(4)
  idatCrc.writeInt32BE(crc32(idatPayload), 0)
  const idat = Buffer.concat([idatLen, idatPayload, idatCrc])

  // IEND chunk
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])

  void label // label is conceptual; the red dot serves as badge
  return Buffer.concat([signature, ihdr, idat, iend])
}

/** Minimal zlib-wrapped uncompressed deflate */
function deflateUncompressed(data: Buffer): Buffer {
  // zlib header
  const header = Buffer.from([0x78, 0x01])
  // Split into blocks of max 65535 bytes
  const blocks: Buffer[] = [header]
  let offset = 0
  while (offset < data.length) {
    const remaining = data.length - offset
    const blockSize = Math.min(remaining, 65535)
    const isLast = offset + blockSize >= data.length
    const blockHeader = Buffer.alloc(5)
    blockHeader[0] = isLast ? 1 : 0
    blockHeader.writeUInt16LE(blockSize, 1)
    blockHeader.writeUInt16LE(blockSize ^ 0xffff, 3)
    blocks.push(blockHeader)
    blocks.push(data.subarray(offset, offset + blockSize))
    offset += blockSize
  }
  // Adler32 checksum
  const adler = adler32(data)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(adler, 0)
  blocks.push(checksum)
  return Buffer.concat(blocks)
}

function adler32(data: Buffer): number {
  let a = 1
  let b = 0
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521
    b = (b + a) % 65521
  }
  return (b << 16) | a
}

/** CRC32 for PNG chunks */
function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) | 0
}
