import { useState, useRef, useEffect } from 'react'
import { Track } from 'livekit-client'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useServerStore } from '@renderer/stores/serverStore'
import VoiceSettingsModal from './VoiceSettingsModal'
import SoundboardPanel from './SoundboardPanel'
import { ScreenSharePicker } from './ScreenSharePicker'

export default function VoiceControls() {
  const room = useVoiceStore((s) => s.room)
  const activeChannelId = useVoiceStore((s) => s.activeChannelId)
  const isMuted = useVoiceStore((s) => s.isMuted)
  const isDeafened = useVoiceStore((s) => s.isDeafened)
  const isCameraEnabled = useVoiceStore((s) => s.isCameraEnabled)
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing)
  const inputMode = useVoiceStore((s) => s.inputMode)
  const pushToTalkKey = useVoiceStore((s) => s.pushToTalkKey)
  const isPTTActive = useVoiceStore((s) => s.isPTTActive)
  const leaveVoiceChannel = useVoiceStore((s) => s.leaveVoiceChannel)
  const toggleMute = useVoiceStore((s) => s.toggleMute)
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen)
  const toggleCamera = useVoiceStore((s) => s.toggleCamera)
  const toggleScreenShare = useVoiceStore((s) => s.toggleScreenShare)
  const setPTTActive = useVoiceStore((s) => s.setPTTActive)

  const channels = useServerStore((s) => s.channels)
  const [showSettings, setShowSettings] = useState(false)
  const [showSoundboard, setShowSoundboard] = useState(false)
  const meterRef = useRef<HTMLDivElement>(null)
  const micButtonRef = useRef<HTMLButtonElement>(null)

  // Push-to-talk key listeners
  useEffect(() => {
    if (inputMode !== 'push_to_talk' || !room) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === pushToTalkKey || e.key === pushToTalkKey) {
        e.preventDefault()
        setPTTActive(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === pushToTalkKey || e.key === pushToTalkKey) {
        e.preventDefault()
        setPTTActive(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [inputMode, pushToTalkKey, room, setPTTActive])

  // Tap the local mic MediaStream directly via Web Audio AnalyserNode
  // for near-zero-latency level detection (bypasses LiveKit's ~100ms audioLevel updates)
  useEffect(() => {
    if (!room) return
    let frameId: number
    let smoothed = 0
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let dataArray: Uint8Array<ArrayBuffer> | null = null
    const ATTACK = 0.4
    const DECAY = 0.12
    const GATE = 0.05  // ignore noise floor below this level

    const setupAnalyser = () => {
      const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      const mediaStreamTrack = micTrack?.track?.mediaStreamTrack
      if (!mediaStreamTrack) return false

      audioCtx = new AudioContext()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      const stream = new MediaStream([mediaStreamTrack])
      source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      dataArray = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>
      return true
    }

    const getRMS = (): number => {
      if (!analyser || !dataArray) return 0
      analyser.getByteTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128
        sum += sample * sample
      }
      // Scale up so normal speech fills the meter nicely
      return Math.min(Math.sqrt(sum / dataArray.length) * 4, 1)
    }

    let analyserReady = setupAnalyser()

    const poll = () => {
      // Retry setup if mic track wasn't ready on first attempt
      if (!analyserReady) analyserReady = setupAnalyser()

      const rms = analyserReady ? getRMS() : 0
      const raw = rms < GATE ? 0 : rms
      const alpha = raw > smoothed ? ATTACK : DECAY
      smoothed += alpha * (raw - smoothed)
      if (meterRef.current) {
        meterRef.current.style.transform = `scaleX(${smoothed})`
      }
      if (micButtonRef.current) {
        const active = !useVoiceStore.getState().isMuted && smoothed > 0.01
        micButtonRef.current.dataset.micActive = active ? '1' : '0'
      }
      frameId = requestAnimationFrame(poll)
    }
    frameId = requestAnimationFrame(poll)

    return () => {
      cancelAnimationFrame(frameId)
      source?.disconnect()
      audioCtx?.close()
    }
  }, [room])

  if (!activeChannelId) return null

  const channel = channels.find((c) => c.id === activeChannelId)
  const isPTTMode = inputMode === 'push_to_talk'

  return (
    <div className="p-3 bg-sol-bg border-t border-sol-bg-elevated">
      {/* Channel name + connection status */}
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span className="text-sol-sage text-xs">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-1 14.93A7.004 7.004 0 015 9h2a5 5 0 0010 0h2a7.004 7.004 0 01-6 6.93V20h4v2H8v-2h4v-4.07z" />
          </svg>
        </span>
        <span className="text-xs text-sol-text-primary truncate font-mono">
          {channel?.name ?? 'Voice'}
        </span>
        <span className="flex items-center gap-1 ml-auto shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-sol-sage animate-pulse" />
          <span className="text-[10px] text-sol-sage font-mono">Connected</span>
        </span>
      </div>

      {/* PTT indicator */}
      {isPTTMode && (
        <div className={`text-[10px] font-mono mb-1 text-center py-0.5 rounded transition-colors ${
          isPTTActive
            ? 'bg-sol-sage/20 text-sol-sage'
            : 'bg-sol-bg-elevated text-sol-text-muted'
        }`}>
          {isPTTActive ? 'Transmitting...' : `Push [${pushToTalkKey}] to talk`}
        </div>
      )}

      {/* Audio level meter */}
      <div className="h-1 bg-sol-bg-elevated rounded-full mb-2 overflow-hidden">
        <div
          ref={meterRef}
          className="h-full w-full origin-left bg-sol-sage rounded-full will-change-transform"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center flex-wrap gap-2">
        {/* Mute */}
        <button
          ref={micButtonRef}
          onClick={toggleMute}
          data-mic-active="0"
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            isMuted
              ? 'bg-sol-amber/20 text-sol-amber'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary data-[mic-active=1]:text-sol-sage data-[mic-active=1]:ring-1 data-[mic-active=1]:ring-sol-sage/50'
          }`}
          title={isPTTMode ? 'Push to Talk active' : isMuted ? 'Unmute' : 'Mute'}
          disabled={isPTTMode}
        >
          {isMuted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              <path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="14" rx="3" />
              <path d="M19 12a7 7 0 01-14 0" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Deafen */}
        <button
          onClick={toggleDeafen}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            isDeafened
              ? 'bg-sol-amber/20 text-sol-amber'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M3.54 12A9 9 0 0121 12" />
              <path d="M3 12v6a1 1 0 001 1h2a1 1 0 001-1v-4" />
              <path d="M21 12v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-4" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0118 0v6" />
              <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
            </svg>
          )}
        </button>

        {/* Camera */}
        <button
          onClick={() => toggleCamera()}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            isCameraEnabled
              ? 'bg-sol-sage/20 text-sol-sage'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraEnabled ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>

        {/* Screen Share */}
        <button
          onClick={() => toggleScreenShare()}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            isScreenSharing
              ? 'bg-sol-sage/20 text-sol-sage'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
            {isScreenSharing && <path d="M8 10l4-4 4 4" />}
          </svg>
        </button>

        {/* Soundboard */}
        <button
          onClick={() => setShowSoundboard(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary transition-colors"
          title="Soundboard"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary transition-colors"
          title="Voice & Video Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* Disconnect */}
        <button
          onClick={leaveVoiceChannel}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
          title="Disconnect"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.73.8 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-6-6A19.79 19.79 0 012 4.18 2 2 0 014 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>

      {showSettings && <VoiceSettingsModal onClose={() => setShowSettings(false)} />}
      {showSoundboard && <SoundboardPanel onClose={() => setShowSoundboard(false)} />}
      <ScreenSharePicker />
    </div>
  )
}
