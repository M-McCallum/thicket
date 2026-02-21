import { useRef, useEffect } from 'react'
import { Track } from 'livekit-client'
import type { VoiceParticipant } from '@/stores/voiceStore'

interface VideoTileProps {
  participant: VoiceParticipant
  track: Track | null
  isSpeaking: boolean
  isLocal?: boolean
  isScreenShare?: boolean
  onClick?: () => void
  className?: string
}

export default function VideoTile({
  participant,
  track,
  isSpeaking,
  isLocal,
  isScreenShare,
  onClick,
  className = ''
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !track) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])

  const initials = participant.username
    .split(/[\s_-]+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div
      onClick={onClick}
      className={`relative bg-sol-bg rounded-lg overflow-hidden cursor-pointer group ${
        isSpeaking ? 'ring-2 ring-sol-sage shadow-[0_0_12px_rgba(133,153,0,0.3)]' : ''
      } ${className}`}
    >
      {track ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full ${isScreenShare ? 'object-contain' : 'object-cover'} ${isLocal && !isScreenShare ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-sol-bg-elevated">
          <div className="w-16 h-16 rounded-full bg-sol-bg flex items-center justify-center text-xl font-display text-sol-text-secondary">
            {initials}
          </div>
        </div>
      )}

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 flex items-end justify-between">
        <span className="text-xs text-white font-mono truncate">
          {isScreenShare ? `${participant.username}'s screen` : participant.username}
          {isLocal && !isScreenShare && ' (You)'}
        </span>
        <div className="flex items-center gap-1">
          {participant.muted && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            </svg>
          )}
          {!track && !isScreenShare && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3l2-3h8l2 3h3a2 2 0 012 2v9" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
