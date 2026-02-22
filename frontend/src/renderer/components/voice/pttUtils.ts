const MOUSE_BUTTON_NAMES: Record<number, string> = {
  0: 'Left Click',
  1: 'Middle Click',
  2: 'Right Click',
  3: 'Mouse 4',
  4: 'Mouse 5'
}

export function formatPTTKeyName(code: string): string {
  if (code.startsWith('Mouse')) {
    const btn = parseInt(code.slice(5), 10)
    return MOUSE_BUTTON_NAMES[btn] ?? `Mouse ${btn + 1}`
  }
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code.replace(/([A-Z])/g, ' $1').trim()
}
