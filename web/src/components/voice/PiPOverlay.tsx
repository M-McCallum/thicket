import { useRef, useEffect, useState, useCallback } from 'react'
import { Track } from 'livekit-client'
import { useVoiceStore } from '@/stores/voiceStore'

export default function PiPOverlay() {
  const {
    room, isPiPActive, togglePiP, participants,
    focusedParticipantId, setVideoLayoutMode, setFocusedParticipant
  } = useVoiceStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [initialized, setInitialized] = useState(false)
  const dragState = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)

  // Find the track to display: focused participant's screen share or camera, or first available
  const displayTrack = (() => {
    if (focusedParticipantId) {
      const p = participants.find((p) => p.userId === focusedParticipantId)
      if (p?.screenTrack) return p.screenTrack
      if (p?.videoTrack) return p.videoTrack
    }
    // Check local participant
    if (room?.localParticipant) {
      const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
      if (screenPub?.track) return screenPub.track
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (camPub?.track) return camPub.track
    }
    // First remote with video
    for (const p of participants) {
      if (p.screenTrack) return p.screenTrack
      if (p.videoTrack) return p.videoTrack
    }
    return null
  })()

  // Initialize position to bottom-right
  useEffect(() => {
    if (isPiPActive && !initialized) {
      setPosition({ x: window.innerWidth - 336, y: window.innerHeight - 196 })
      setInitialized(true)
    }
    if (!isPiPActive) {
      setInitialized(false)
    }
  }, [isPiPActive, initialized])

  // Attach/detach track
  useEffect(() => {
    const el = videoRef.current
    if (!el || !displayTrack) return
    displayTrack.attach(el)
    return () => {
      displayTrack.detach(el)
    }
  }, [displayTrack])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y
    }

    const handleMove = (e: MouseEvent) => {
      if (!dragState.current) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 320, dragState.current.startPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 180, dragState.current.startPosY + dy))
      })
    }

    const handleUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [position])

  const handleExpand = () => {
    togglePiP()
    setVideoLayoutMode('focus')
    if (focusedParticipantId) {
      setFocusedParticipant(focusedParticipantId)
    }
  }

  if (!isPiPActive || !displayTrack) return null

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-80 rounded-lg overflow-hidden shadow-2xl border border-sol-bg-elevated bg-sol-bg"
      style={{ left: position.x, top: position.y }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="absolute inset-x-0 top-0 h-6 cursor-move z-10 bg-gradient-to-b from-black/40 to-transparent"
      />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full aspect-video object-cover"
      />

      {/* Controls */}
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button
          onClick={handleExpand}
          className="p-1 rounded bg-black/50 text-white hover:bg-black/70 transition-colors"
          title="Expand"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
        <button
          onClick={togglePiP}
          className="p-1 rounded bg-black/50 text-white hover:bg-black/70 transition-colors"
          title="Close PiP"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
