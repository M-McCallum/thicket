const STORAGE_KEYS = {
  enabled: 'voice:notificationSounds',
  joinSound: 'voice:joinSound',
  leaveSound: 'voice:leaveSound'
} as const

type SoundType = 'join' | 'leave'

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext()
  }
  return audioContext
}

function synthesizeJoinSound(ctx: AudioContext) {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.connect(gain)
  gain.connect(ctx.destination)

  // Ascending "bloop" — two quick tones rising in pitch
  osc.type = 'sine'
  osc.frequency.setValueAtTime(400, now)
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.12)

  gain.gain.setValueAtTime(0.3, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)

  osc.start(now)
  osc.stop(now + 0.2)
}

function synthesizeLeaveSound(ctx: AudioContext) {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.connect(gain)
  gain.connect(ctx.destination)

  // Descending "bloop" — pitch drops
  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, now)
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.15)

  gain.gain.setValueAtTime(0.3, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)

  osc.start(now)
  osc.stop(now + 0.25)
}

async function playCustomSound(ctx: AudioContext, dataUrl: string) {
  const response = await fetch(dataUrl)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(ctx.destination)
  source.start()
}

export const soundService = {
  isEnabled(): boolean {
    const stored = localStorage.getItem(STORAGE_KEYS.enabled)
    return stored !== 'false' // default enabled
  },

  setEnabled(enabled: boolean) {
    localStorage.setItem(STORAGE_KEYS.enabled, String(enabled))
  },

  getCustomSound(type: SoundType): string | null {
    const key = type === 'join' ? STORAGE_KEYS.joinSound : STORAGE_KEYS.leaveSound
    return localStorage.getItem(key)
  },

  async setCustomSound(type: SoundType, file: File) {
    const key = type === 'join' ? STORAGE_KEYS.joinSound : STORAGE_KEYS.leaveSound
    const dataUrl = await fileToDataUrl(file)
    localStorage.setItem(key, dataUrl)
  },

  clearCustomSound(type: SoundType) {
    const key = type === 'join' ? STORAGE_KEYS.joinSound : STORAGE_KEYS.leaveSound
    localStorage.removeItem(key)
  },

  async playJoinSound() {
    if (!this.isEnabled()) return
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const custom = this.getCustomSound('join')
    if (custom) {
      await playCustomSound(ctx, custom)
    } else {
      synthesizeJoinSound(ctx)
    }
  },

  async playLeaveSound() {
    if (!this.isEnabled()) return
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const custom = this.getCustomSound('leave')
    if (custom) {
      await playCustomSound(ctx, custom)
    } else {
      synthesizeLeaveSound(ctx)
    }
  },

  async previewSound(type: SoundType) {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const custom = this.getCustomSound(type)
    if (custom) {
      await playCustomSound(ctx, custom)
    } else if (type === 'join') {
      synthesizeJoinSound(ctx)
    } else {
      synthesizeLeaveSound(ctx)
    }
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
