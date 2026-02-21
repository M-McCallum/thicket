import { useState, useRef, useEffect } from 'react'
import { useVoiceStore } from '../../stores/voiceStore'
import { useServerStore } from '../../stores/serverStore'
import VoiceSettingsModal from './VoiceSettingsModal'

export default function VoiceControls() {
  const { room, activeChannelId, isMuted, isDeafened, leaveVoiceChannel, toggleMute, toggleDeafen } =
    useVoiceStore()
  const { channels } = useServerStore()
  const [showSettings, setShowSettings] = useState(false)
  const meterRef = useRef<HTMLDivElement>(null)
  const micButtonRef = useRef<HTMLButtonElement>(null)

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

    const setupAnalyser = async () => {
      const { Track } = await import('livekit-client')
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

    let analyserReady = false
    let setupPending = false

    const trySetup = () => {
      if (analyserReady || setupPending) return
      setupPending = true
      setupAnalyser().then((ok) => {
        analyserReady = ok
        setupPending = false
      })
    }
    trySetup()

    const poll = () => {
      // Retry setup if mic track wasn't ready on first attempt
      if (!analyserReady) trySetup()

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

      {/* Audio level meter */}
      <div className="h-1 bg-sol-bg-elevated rounded-full mb-2 overflow-hidden">
        <div
          ref={meterRef}
          className="h-full w-full origin-left bg-sol-sage rounded-full will-change-transform"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Mute */}
        <button
          ref={micButtonRef}
          onClick={toggleMute}
          data-mic-active="0"
          className={`flex-1 flex items-center justify-center p-1.5 rounded transition-colors ${
            isMuted
              ? 'bg-sol-amber/20 text-sol-amber'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary data-[mic-active=1]:text-sol-sage data-[mic-active=1]:ring-1 data-[mic-active=1]:ring-sol-sage/50'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            // Mic off
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              <path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            // Mic on
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
          className={`flex-1 flex items-center justify-center p-1.5 rounded transition-colors ${
            isDeafened
              ? 'bg-sol-amber/20 text-sol-amber'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? (
            // Headphones off
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M3.54 12A9 9 0 0121 12" />
              <path d="M3 12v6a1 1 0 001 1h2a1 1 0 001-1v-4" />
              <path d="M21 12v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-4" />
            </svg>
          ) : (
            // Headphones on
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0118 0v6" />
              <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
            </svg>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="flex-1 flex items-center justify-center p-1.5 rounded bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary transition-colors"
          title="Voice Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* Disconnect */}
        <button
          onClick={leaveVoiceChannel}
          className="flex-1 flex items-center justify-center p-1.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
          title="Disconnect"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.73.8 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-6-6A19.79 19.79 0 012 4.18 2 2 0 014 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>

      {showSettings && <VoiceSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
