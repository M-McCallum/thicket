/**
 * Generate all app icon PNGs from source images in new_icons/.
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'new_icons')

// --- App icon 1024x1024 (icon_main — colored with dark bg) ---
await sharp(join(src, 'icon_main.png'))
  .resize(1024, 1024)
  .png()
  .toFile(join(root, 'resources/icon.png'))
console.log('✓ resources/icon.png (1024x1024)')

// --- Windows tray icon 32x32 (colored, needs to read on light/dark taskbars) ---
await sharp(join(src, 'icon_main.png'))
  .resize(32, 32)
  .png()
  .toFile(join(root, 'resources/tray-icon.png'))
console.log('✓ resources/tray-icon.png (32x32)')

// --- Windows tray icon unread 32x32 (colored + amber dot badge) ---
// Composite: shrink main icon slightly then overlay an amber dot in bottom-right
const trayBase = await sharp(join(src, 'icon_main.png'))
  .resize(32, 32)
  .toBuffer()

const dotSvg = Buffer.from(`<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="25" cy="25" r="6" fill="#e8a926"/>
  <circle cx="25" cy="25" r="4" fill="#f0c040"/>
</svg>`)

await sharp(trayBase)
  .composite([{ input: dotSvg, top: 0, left: 0 }])
  .png()
  .toFile(join(root, 'resources/tray-icon-unread.png'))
console.log('✓ resources/tray-icon-unread.png (32x32)')

// --- macOS Template icon 44x44 (monochrome black, transparent bg) ---
// icon_black_transparent.png is already black silhouette on transparent
await sharp(join(src, 'icon_black_transparent.png'))
  .resize(44, 44)
  .png()
  .toFile(join(root, 'resources/tray-iconTemplate.png'))
console.log('✓ resources/tray-iconTemplate.png (44x44)')

// --- macOS Template unread 44x44 (monochrome black + dot) ---
const templateBase = await sharp(join(src, 'icon_black_transparent.png'))
  .resize(44, 44)
  .toBuffer()

const dotTemplateSvg = Buffer.from(`<svg width="44" height="44" xmlns="http://www.w3.org/2000/svg">
  <circle cx="36" cy="36" r="5" fill="#000"/>
</svg>`)

await sharp(templateBase)
  .composite([{ input: dotTemplateSvg, top: 0, left: 0 }])
  .png()
  .toFile(join(root, 'resources/tray-icon-unreadTemplate.png'))
console.log('✓ resources/tray-icon-unreadTemplate.png (44x44)')

// --- DMG backgrounds ---
mkdirSync(join(root, 'build'), { recursive: true })

// Use icon_main as a watermark on the DMG background
const watermark = await sharp(join(src, 'icon_main.png'))
  .resize(80, 80)
  .ensureAlpha()
  .modulate({ brightness: 0.6 })
  .toBuffer()

const dmgBg = (w, h) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a2a1a"/>
      <stop offset="100%" stop-color="#0f1a0f"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#dbg)"/>
  <text x="${w/2}" y="${h * 0.12}" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, sans-serif" font-size="${h * 0.06}" font-weight="600" fill="#e8a926" opacity="0.9">Thicket</text>
  <line x1="${w * 0.38}" y1="${h * 0.44}" x2="${w * 0.62}" y2="${h * 0.44}" stroke="#e8a926" stroke-width="2" stroke-dasharray="6,4" opacity="0.5"/>
  <polygon points="${w * 0.62},${h * 0.41} ${w * 0.66},${h * 0.44} ${w * 0.62},${h * 0.47}" fill="#e8a926" opacity="0.5"/>
</svg>`)

await sharp(dmgBg(660, 400))
  .composite([{ input: watermark, top: 310, left: 290, blend: 'over' }])
  .png()
  .toFile(join(root, 'build/dmg-background.png'))
console.log('✓ build/dmg-background.png (660x400)')

// 2x retina
const watermark2x = await sharp(join(src, 'icon_main.png'))
  .resize(160, 160)
  .ensureAlpha()
  .modulate({ brightness: 0.6 })
  .toBuffer()

await sharp(dmgBg(1320, 800))
  .composite([{ input: watermark2x, top: 620, left: 580, blend: 'over' }])
  .png()
  .toFile(join(root, 'build/dmg-background@2x.png'))
console.log('✓ build/dmg-background@2x.png (1320x800)')

console.log('\nDone! All icons generated from new_icons/.')
