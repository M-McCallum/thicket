import { useState, useEffect, useRef, useCallback } from 'react'
import { soundboard, resolveAttachmentUrl } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useServerStore } from '@/stores/serverStore'
import type { SoundboardSound } from '@/types/models'

const ACCEPTED_TYPES = '.mp3,.wav,.ogg'
const MAX_DURATION_MS = 5000
const MAX_FILE_SIZE = 1 << 20 // 1 MB

interface SoundboardPanelProps {
  onClose: () => void
}

export default function SoundboardPanel({ onClose }: SoundboardPanelProps) {
  const [sounds, setSounds] = useState<SoundboardSound[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(0.5)
  const [muted, setMuted] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDuration, setUploadDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const userId = useAuthStore((s) => s.user?.id)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const activeServer = useServerStore((s) => s.servers.find((sv) => sv.id === s.activeServerId))
  const isOwner = activeServer?.owner_id === userId

  const loadSounds = useCallback(async () => {
    if (!activeServerId) return
    try {
      setLoading(true)
      const data = await soundboard.list(activeServerId)
      setSounds(data)
    } catch {
      setError('Failed to load sounds')
    } finally {
      setLoading(false)
    }
  }, [activeServerId])

  useEffect(() => {
    loadSounds()
  }, [loadSounds])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const playSound = (sound: SoundboardSound) => {
    if (muted) return

    // Stop currently playing sound
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const audio = new Audio(resolveAttachmentUrl(sound.url))
    audio.volume = volume
    audioRef.current = audio

    setPlayingId(sound.id)
    audio.addEventListener('ended', () => {
      setPlayingId(null)
      audioRef.current = null
    })
    audio.addEventListener('error', () => {
      setPlayingId(null)
      audioRef.current = null
    })
    audio.play().catch(() => {
      setPlayingId(null)
      audioRef.current = null
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setError('File must be 1MB or less')
      return
    }

    // Check duration using Web Audio API
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.addEventListener('loadedmetadata', () => {
      const durationMs = Math.round(audio.duration * 1000)
      URL.revokeObjectURL(url)
      if (durationMs > MAX_DURATION_MS) {
        setError('Sound must be 5 seconds or less')
        return
      }
      setUploadFile(file)
      setUploadDuration(durationMs)
      if (!uploadName) {
        // Use filename without extension as default name
        const baseName = file.name.replace(/\.[^.]+$/, '')
        setUploadName(baseName)
      }
    })
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      setError('Could not read audio file')
    })
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !uploadName.trim() || !activeServerId) return

    try {
      setUploading(true)
      setError(null)
      const sound = await soundboard.upload(activeServerId, uploadName.trim(), uploadFile, uploadDuration)
      setSounds((prev) => [...prev, sound].sort((a, b) => a.name.localeCompare(b.name)))
      setShowUpload(false)
      setUploadName('')
      setUploadFile(null)
      setUploadDuration(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (soundId: string) => {
    if (!activeServerId) return
    try {
      await soundboard.delete(activeServerId, soundId)
      setSounds((prev) => prev.filter((s) => s.id !== soundId))
    } catch {
      setError('Failed to delete sound')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl w-[480px] max-h-[600px] flex flex-col animate-grow-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sol-bg-elevated">
          <h3 className="font-display text-lg text-sol-amber">Soundboard</h3>
          <div className="flex items-center gap-2">
            {/* Volume slider */}
            <button
              onClick={() => setMuted(!muted)}
              className={`p-1 rounded transition-colors ${
                muted ? 'text-sol-amber' : 'text-sol-text-secondary hover:text-sol-text-primary'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value))
                if (muted && Number(e.target.value) > 0) setMuted(false)
              }}
              className="w-20 accent-sol-amber"
              title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
            />
            <button
              onClick={onClose}
              className="p-1 text-sol-text-muted hover:text-sol-text-primary transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="px-4 py-2 bg-red-900/20 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Sound grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sol-text-muted text-sm">
              Loading sounds...
            </div>
          ) : sounds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-sol-text-muted text-sm gap-2">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
              <span>No sounds yet</span>
              <span className="text-xs">Upload a sound to get started</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {sounds.map((sound) => {
                const isPlaying = playingId === sound.id
                const canDelete = sound.creator_id === userId || isOwner
                return (
                  <div
                    key={sound.id}
                    className={`relative group rounded-lg border transition-colors cursor-pointer ${
                      isPlaying
                        ? 'border-sol-amber bg-sol-amber/10'
                        : 'border-sol-bg-elevated bg-sol-bg hover:border-sol-text-muted hover:bg-sol-bg-elevated/50'
                    }`}
                    onClick={() => playSound(sound)}
                  >
                    <div className="p-3 flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 ${isPlaying ? 'text-sol-amber' : 'text-sol-text-muted'}`}>
                        {isPlaying ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="4" y="4" width="6" height="16" rx="1" />
                            <rect x="14" y="4" width="6" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </span>
                      <span className="text-sm text-sol-text-primary truncate">{sound.name}</span>
                    </div>
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(sound.id)
                        }}
                        className="absolute top-1 right-1 p-0.5 rounded text-sol-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete sound"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Upload area */}
        <div className="p-4 border-t border-sol-bg-elevated">
          {showUpload ? (
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-sol-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-sol-bg-elevated file:text-sol-text-primary hover:file:bg-sol-bg-elevated/80 file:cursor-pointer"
                />
                <p className="text-xs text-sol-text-muted mt-1">Max 5 seconds, 1MB. Formats: MP3, WAV, OGG</p>
              </div>
              {uploadFile && (
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Sound name"
                  className="input-field w-full"
                  maxLength={50}
                  required
                />
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowUpload(false)
                    setUploadFile(null)
                    setUploadName('')
                    setUploadDuration(0)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="btn-danger"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || !uploadName.trim() || uploading}
                  className="btn-primary disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowUpload(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-sol-text-secondary hover:text-sol-amber bg-sol-bg hover:bg-sol-amber/10 rounded-lg transition-colors border border-sol-bg-elevated"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Upload Sound
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
