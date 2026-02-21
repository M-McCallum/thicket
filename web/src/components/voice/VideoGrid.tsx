import { useMemo } from 'react'
import { Track } from 'livekit-client'
import { useVoiceStore } from '@/stores/voiceStore'
import type { VoiceParticipant } from '@/stores/voiceStore'
import VideoTile from './VideoTile'

interface LocalParticipantTile {
  participant: VoiceParticipant
  track: Track | null
  screenTrack: Track | null
  isLocal: true
}

function getGridCols(count: number): string {
  if (count <= 1) return 'grid-cols-1'
  if (count <= 2) return 'grid-cols-2'
  if (count <= 4) return 'grid-cols-2'
  if (count <= 9) return 'grid-cols-3'
  if (count <= 16) return 'grid-cols-4'
  return 'grid-cols-5'
}

export default function VideoGrid() {
  const {
    room,
    participants,
    speakingUserIds,
    isCameraEnabled,
    isScreenSharing,
    videoLayoutMode,
    focusedTileKey,
    localTrackVersion,
    setFocusedParticipant,
    setVideoLayoutMode
  } = useVoiceStore()

  const localParticipant = room?.localParticipant

  // Build tile list: local + remotes, including screen share tiles
  const tiles = useMemo(() => {
    const result: Array<{
      key: string
      participant: VoiceParticipant
      track: Track | null
      isLocal: boolean
      isScreenShare: boolean
    }> = []

    // Local participant
    if (localParticipant) {
      const localCameraTrack = isCameraEnabled ? (localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null) : null
      const localScreenTrack = isScreenSharing ? (localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null) : null
      const localP: VoiceParticipant = {
        userId: localParticipant.identity,
        username: localParticipant.name || localParticipant.identity,
        muted: !localParticipant.isMicrophoneEnabled,
        deafened: false,
        cameraEnabled: isCameraEnabled,
        screenShareEnabled: isScreenSharing,
        videoTrack: localCameraTrack,
        screenTrack: localScreenTrack
      }
      result.push({ key: `local-cam`, participant: localP, track: localCameraTrack, isLocal: true, isScreenShare: false })
      if (isScreenSharing && localScreenTrack) {
        result.push({ key: `local-screen`, participant: localP, track: localScreenTrack, isLocal: true, isScreenShare: true })
      }
    }

    // Remote participants (exclude local user — already added above)
    const localId = localParticipant?.identity
    for (const p of participants) {
      if (p.userId === localId) continue
      result.push({ key: `${p.userId}-cam`, participant: p, track: p.videoTrack, isLocal: false, isScreenShare: false })
      if (p.screenShareEnabled && p.screenTrack) {
        result.push({ key: `${p.userId}-screen`, participant: p, track: p.screenTrack, isLocal: false, isScreenShare: true })
      }
    }

    return result
  }, [localParticipant, participants, isCameraEnabled, isScreenSharing, localTrackVersion])

  const focusedTile = focusedTileKey
    ? tiles.find((t) => t.key === focusedTileKey) ?? null
    : null

  const isFocusMode = videoLayoutMode === 'focus' && focusedTile

  return (
    <div className="relative flex-1 min-h-0 bg-sol-bg p-2">
      {/* Layout switcher toolbar */}
      <div className="absolute top-3 right-3 z-10 flex gap-1 bg-sol-bg-secondary/80 backdrop-blur rounded-lg p-1">
        <button
          onClick={() => setVideoLayoutMode('grid')}
          className={`p-1.5 rounded transition-colors ${videoLayoutMode === 'grid' ? 'text-sol-amber bg-sol-amber/10' : 'text-sol-text-muted hover:text-sol-text-primary'}`}
          title="Grid view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
        <button
          onClick={() => {
            setVideoLayoutMode('focus')
            if (!focusedTileKey && tiles.length > 0) {
              setFocusedParticipant(tiles[0].key)
            }
          }}
          className={`p-1.5 rounded transition-colors ${videoLayoutMode === 'focus' ? 'text-sol-amber bg-sol-amber/10' : 'text-sol-text-muted hover:text-sol-text-primary'}`}
          title="Focus view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="15" height="18" rx="2" />
            <rect x="19" y="3" width="3" height="5" rx="1" />
            <rect x="19" y="10" width="3" height="5" rx="1" />
          </svg>
        </button>
      </div>

      {isFocusMode ? (
        // Focus layout: large tile + sidebar strip
        <div className="flex h-full gap-2">
          <div className="flex-1 min-w-0">
            <VideoTile
              participant={focusedTile.participant}
              track={focusedTile.track}
              isSpeaking={speakingUserIds.includes(focusedTile.participant.userId)}
              isLocal={focusedTile.isLocal}
              isScreenShare={focusedTile.isScreenShare}
              className="w-full h-full"
            />
          </div>
          <div className="w-48 flex flex-col gap-2 overflow-y-auto">
            {tiles
              .filter((t) => t.key !== focusedTile.key)
              .map((tile) => (
                <VideoTile
                  key={tile.key}
                  participant={tile.participant}
                  track={tile.track}
                  isSpeaking={speakingUserIds.includes(tile.participant.userId)}
                  isLocal={tile.isLocal}
                  isScreenShare={tile.isScreenShare}
                  onClick={() => setFocusedParticipant(tile.key)}
                  className="aspect-video"
                />
              ))}
          </div>
        </div>
      ) : (
        // Grid layout
        <div className={`grid ${getGridCols(tiles.length)} gap-2 h-full auto-rows-fr`}>
          {tiles.map((tile) => (
            <VideoTile
              key={tile.key}
              participant={tile.participant}
              track={tile.track}
              isSpeaking={speakingUserIds.includes(tile.participant.userId)}
              isLocal={tile.isLocal}
              isScreenShare={tile.isScreenShare}
              onClick={() => {
                setFocusedParticipant(tile.key)
                setVideoLayoutMode('focus')
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
