import { useState, useEffect, useRef, useCallback } from 'react'
import { Room } from 'livekit-client'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import type { VideoQuality, ScreenShareQuality, InputMode } from '@renderer/stores/voiceStore'
import { soundService } from '@renderer/services/soundService'
import { formatPTTKeyName } from './pttUtils'

interface VoiceSettingsModalProps {
  onClose: () => void
}

interface DeviceInfo {
  deviceId: string
  label: string
}

type SettingsTab = 'audio' | 'video' | 'sounds' | 'advanced'

const TAB_ITEMS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'audio', label: 'Audio',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>,
  },
  {
    id: 'video', label: 'Video',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  },
  {
    id: 'sounds', label: 'Sounds',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>,
  },
  {
    id: 'advanced', label: 'Advanced',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  },
]

export default function VoiceSettingsModal({ onClose }: VoiceSettingsModalProps) {
  const selectedInputDeviceId = useVoiceStore((s) => s.selectedInputDeviceId)
  const selectedOutputDeviceId = useVoiceStore((s) => s.selectedOutputDeviceId)
  const setInputDevice = useVoiceStore((s) => s.setInputDevice)
  const setOutputDevice = useVoiceStore((s) => s.setOutputDevice)
  const selectedVideoDeviceId = useVoiceStore((s) => s.selectedVideoDeviceId)
  const setVideoDevice = useVoiceStore((s) => s.setVideoDevice)
  const videoQuality = useVoiceStore((s) => s.videoQuality)
  const setVideoQuality = useVoiceStore((s) => s.setVideoQuality)
  const inputMode = useVoiceStore((s) => s.inputMode)
  const setInputMode = useVoiceStore((s) => s.setInputMode)
  const pushToTalkKey = useVoiceStore((s) => s.pushToTalkKey)
  const setPushToTalkKey = useVoiceStore((s) => s.setPushToTalkKey)
  const noiseSuppression = useVoiceStore((s) => s.noiseSuppression)
  const setNoiseSuppression = useVoiceStore((s) => s.setNoiseSuppression)
  const pttReleaseDelay = useVoiceStore((s) => s.pttReleaseDelay)
  const setPTTReleaseDelay = useVoiceStore((s) => s.setPTTReleaseDelay)
  const participants = useVoiceStore((s) => s.participants)
  const perUserVolume = useVoiceStore((s) => s.perUserVolume)
  const setPerUserVolume = useVoiceStore((s) => s.setPerUserVolume)
  const screenShareQuality = useVoiceStore((s) => s.screenShareQuality)
  const setScreenShareQuality = useVoiceStore((s) => s.setScreenShareQuality)

  const [activeTab, setActiveTab] = useState<SettingsTab>('audio')
  const [inputDevices, setInputDevices] = useState<DeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<DeviceInfo[]>([])
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)

  const [isCapturingKey, setIsCapturingKey] = useState(false)
  const [soundsEnabled, setSoundsEnabled] = useState(soundService.isEnabled())
  const [hasCustomJoin, setHasCustomJoin] = useState(!!soundService.getCustomSound('join'))
  const [hasCustomLeave, setHasCustomLeave] = useState(!!soundService.getCustomSound('leave'))
  const joinInputRef = useRef<HTMLInputElement>(null)
  const leaveInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadDevices() {
      const inputs = await Room.getLocalDevices('audioinput')
      const outputs = await Room.getLocalDevices('audiooutput')
      setInputDevices(inputs.map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)})` })))
      setOutputDevices(outputs.map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker (${d.deviceId.slice(0, 8)})` })))
      const videos = await Room.getLocalDevices('videoinput')
      setVideoDevices(videos.map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera (${d.deviceId.slice(0, 8)})` })))
    }
    loadDevices()
  }, [])

  useEffect(() => {
    if (activeTab !== 'video') return
    let stream: MediaStream | null = null
    let cancelled = false

    async function startPreview() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        setPreviewStream(stream)
        if (previewRef.current) previewRef.current.srcObject = stream
      } catch { /* Camera unavailable */ }
    }
    startPreview()
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); setPreviewStream(null) }
  }, [activeTab, selectedVideoDeviceId])

  useEffect(() => {
    if (!isCapturingKey) return
    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Escape') { setIsCapturingKey(false); return }
      setPushToTalkKey(e.code); setIsCapturingKey(false)
    }
    const handleMouse = (e: MouseEvent) => {
      // Only capture non-primary buttons (side buttons, middle, right)
      if (e.button === 0) return
      e.preventDefault(); e.stopPropagation()
      setPushToTalkKey(`Mouse${e.button}`); setIsCapturingKey(false)
    }
    const preventContext = (e: Event) => { e.preventDefault() }
    window.addEventListener('keydown', handleKey, true)
    window.addEventListener('mousedown', handleMouse, true)
    window.addEventListener('contextmenu', preventContext, true)
    return () => {
      window.removeEventListener('keydown', handleKey, true)
      window.removeEventListener('mousedown', handleMouse, true)
      window.removeEventListener('contextmenu', preventContext, true)
    }
  }, [isCapturingKey, setPushToTalkKey])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') { previewStream?.getTracks().forEach((t) => t.stop()); onClose() } },
    [onClose, previewStream]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleClose = () => { previewStream?.getTracks().forEach((t) => t.stop()); onClose() }

  const handleToggleSounds = () => {
    const next = !soundsEnabled; soundService.setEnabled(next); setSoundsEnabled(next)
  }

  const handleUpload = async (type: 'join' | 'leave', file: File) => {
    await soundService.setCustomSound(type, file)
    if (type === 'join') setHasCustomJoin(true); else setHasCustomLeave(true)
  }

  const handleReset = (type: 'join' | 'leave') => {
    soundService.clearCustomSound(type)
    if (type === 'join') setHasCustomJoin(false); else setHasCustomLeave(false)
  }

  const qualityOptions: { value: VideoQuality; label: string }[] = [
    { value: '1080p_60', label: '1080p @ 60fps (Smooth)' },
    { value: '1080p', label: '1080p @ 30fps (Full HD)' },
    { value: '720p_60', label: '720p @ 60fps (Smooth)' },
    { value: '720p', label: '720p @ 30fps (HD)' },
    { value: '480p', label: '480p' },
    { value: '360p', label: '360p' }
  ]

  const screenShareOptions: { value: ScreenShareQuality; label: string }[] = [
    { value: '1080p_60', label: '1080p @ 60fps (Smooth)' },
    { value: '1080p_30', label: '1080p @ 30fps (Recommended)' },
    { value: '1080p_15', label: '1080p @ 15fps (Low bandwidth)' },
    { value: '720p_60', label: '720p @ 60fps (Smooth)' },
    { value: '720p_30', label: '720p @ 30fps (Fastest)' },
    { value: '4k_15', label: '4K @ 15fps (Best quality)' }
  ]

  const formatKeyName = formatPTTKeyName

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={handleClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg border border-sol-bg-elevated rounded-xl shadow-2xl w-[520px] max-w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Voice and video settings"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-sol-bg-elevated bg-sol-bg-secondary">
          <div className="w-8 h-8 rounded-lg bg-sol-amber/15 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-amber">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sol-text-primary">Voice & Video</p>
            <p className="text-[11px] text-sol-text-muted font-mono uppercase tracking-wider">Settings</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full border border-sol-bg-elevated flex items-center justify-center text-sol-text-muted hover:text-sol-text-primary hover:border-sol-text-muted transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1.5 mx-5 mt-4 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl">
          {TAB_ITEMS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-lg transition-all ${
                activeTab === t.id
                  ? 'bg-sol-bg-elevated text-sol-text-primary font-medium shadow-sm'
                  : 'text-sol-text-muted hover:text-sol-text-secondary'
              }`}
            >
              <span className={activeTab === t.id ? 'text-sol-amber' : ''}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {activeTab === 'audio' && (
            <>
              {/* Devices */}
              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-4">
                <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Devices</h4>
                <div>
                  <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Input Device</label>
                  <select
                    className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
                    value={selectedInputDeviceId ?? ''}
                    onChange={(e) => setInputDevice(e.target.value)}
                  >
                    {inputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Output Device</label>
                  <select
                    className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
                    value={selectedOutputDeviceId ?? ''}
                    onChange={(e) => setOutputDevice(e.target.value)}
                  >
                    {outputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Input Mode */}
              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
                <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Input Mode</h4>
                <div className="flex gap-2">
                  {(['voice_activity', 'push_to_talk'] as InputMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setInputMode(mode)}
                      className={`flex-1 py-2.5 px-3 rounded-lg text-sm transition-all ${
                        inputMode === mode
                          ? 'bg-sol-amber/10 text-sol-amber border border-sol-amber/30 font-medium'
                          : 'bg-sol-bg-tertiary text-sol-text-secondary border border-sol-bg-elevated hover:border-sol-amber/20'
                      }`}
                    >
                      {mode === 'voice_activity' ? 'Voice Activity' : 'Push to Talk'}
                    </button>
                  ))}
                </div>

                {inputMode === 'push_to_talk' && (
                  <>
                    <div>
                      <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">PTT Key</label>
                      <button
                        onClick={() => setIsCapturingKey(true)}
                        className={`w-full py-2.5 px-3 rounded-lg text-sm font-mono text-left transition-all ${
                          isCapturingKey
                            ? 'bg-sol-sage/10 text-sol-sage border border-sol-sage/30 animate-pulse'
                            : 'bg-sol-bg-tertiary text-sol-text-primary border border-sol-bg-elevated hover:border-sol-amber/20'
                        }`}
                      >
                        {isCapturingKey ? 'Press a key or mouse button...' : formatKeyName(pushToTalkKey)}
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">
                        PTT Release Delay
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={2000}
                          step={50}
                          value={pttReleaseDelay}
                          onChange={(e) => setPTTReleaseDelay(Number(e.target.value))}
                          className="flex-1 accent-sol-amber h-1"
                        />
                        <span className="text-xs text-sol-text-muted w-14 text-right font-mono">{pttReleaseDelay}ms</span>
                      </div>
                      <p className="text-[10px] text-sol-text-muted/60 mt-1">Delay before muting after releasing the PTT key.</p>
                    </div>
                  </>
                )}
              </div>

              {/* Noise Suppression */}
              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4">
                <ToggleRow
                  label="Noise Suppression"
                  description="Reduce background noise from your microphone."
                  checked={noiseSuppression}
                  onChange={() => setNoiseSuppression(!noiseSuppression)}
                />
              </div>
            </>
          )}

          {activeTab === 'video' && (
            <>
              {/* Preview */}
              <div className="rounded-xl overflow-hidden bg-sol-bg-secondary border border-sol-bg-elevated">
                <div className="aspect-video bg-sol-bg">
                  <video
                    ref={previewRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                </div>
              </div>

              {/* Camera */}
              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-4">
                <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Camera</h4>
                <div>
                  <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Device</label>
                  <select
                    className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
                    value={selectedVideoDeviceId ?? ''}
                    onChange={(e) => setVideoDevice(e.target.value)}
                  >
                    {videoDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quality */}
              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-4">
                <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Quality</h4>
                <div>
                  <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Video Quality</label>
                  <select
                    className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
                    value={videoQuality}
                    onChange={(e) => setVideoQuality(e.target.value as VideoQuality)}
                  >
                    {qualityOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Screen Share Quality</label>
                  <select
                    className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
                    value={screenShareQuality}
                    onChange={(e) => setScreenShareQuality(e.target.value as ScreenShareQuality)}
                  >
                    {screenShareOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {activeTab === 'sounds' && (
            <>
              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4">
                <ToggleRow
                  label="Notification Sounds"
                  description="Play sounds for voice channel join/leave events."
                  checked={soundsEnabled}
                  onChange={handleToggleSounds}
                />
              </div>

              <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
                <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Custom Sounds</h4>
                <SoundRow
                  label="Join Sound"
                  hasCustom={hasCustomJoin}
                  onPreview={() => soundService.previewSound('join')}
                  onUpload={() => joinInputRef.current?.click()}
                  onReset={() => handleReset('join')}
                />
                <input ref={joinInputRef} type="file" accept=".mp3,.wav,.ogg" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload('join', f); e.target.value = '' }} />

                <div className="h-px bg-sol-bg-elevated" />

                <SoundRow
                  label="Leave Sound"
                  hasCustom={hasCustomLeave}
                  onPreview={() => soundService.previewSound('leave')}
                  onUpload={() => leaveInputRef.current?.click()}
                  onReset={() => handleReset('leave')}
                />
                <input ref={leaveInputRef} type="file" accept=".mp3,.wav,.ogg" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload('leave', f); e.target.value = '' }} />
              </div>
            </>
          )}

          {activeTab === 'advanced' && (
            <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4">
              <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60 mb-3">Per-User Volume</h4>
              {participants.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-sol-text-muted">No other participants connected</p>
                  <p className="text-xs text-sol-text-muted/60 mt-1">Volume controls appear when others join.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {participants.map((p) => {
                    const vol = perUserVolume[p.userId] ?? 100
                    return (
                      <div key={p.userId} className="flex items-center gap-3">
                        <span className="text-sm text-sol-text-primary w-24 truncate shrink-0">{p.username}</span>
                        <input
                          type="range" min={0} max={300} step={10} value={vol}
                          onChange={(e) => setPerUserVolume(p.userId, Number(e.target.value))}
                          className="flex-1 accent-sol-amber h-1"
                        />
                        <span className="text-xs text-sol-text-muted w-10 text-right font-mono">{vol}%</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-sol-text-secondary">{label}</p>
        <p className="text-xs text-sol-text-muted mt-0.5">{description}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
        }`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

function SoundRow({ label, hasCustom, onPreview, onUpload, onReset }: {
  label: string; hasCustom: boolean; onPreview: () => void; onUpload: () => void; onReset: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-sol-text-primary">{label}</p>
        <p className="text-[10px] font-mono text-sol-text-muted/60 uppercase">{hasCustom ? 'Custom' : 'Default'}</p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={onPreview}
          className="px-2.5 py-1.5 text-xs text-sol-text-secondary hover:text-sol-text-primary bg-sol-bg-elevated rounded-lg transition-colors"
        >
          Preview
        </button>
        <button
          onClick={onUpload}
          className="px-2.5 py-1.5 text-xs text-sol-amber bg-sol-amber/10 rounded-lg hover:bg-sol-amber/15 transition-colors"
        >
          Upload
        </button>
        {hasCustom && (
          <button
            onClick={onReset}
            className="px-2.5 py-1.5 text-xs text-sol-coral bg-sol-coral/10 rounded-lg hover:bg-sol-coral/15 transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
