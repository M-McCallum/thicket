import { useState, useEffect, useRef } from 'react'
import { Room } from 'livekit-client'
import { useVoiceStore } from '@/stores/voiceStore'
import type { VideoQuality } from '@/stores/voiceStore'
import { soundService } from '@/services/soundService'

interface VoiceSettingsModalProps {
  onClose: () => void
}

interface DeviceInfo {
  deviceId: string
  label: string
}

type SettingsTab = 'audio' | 'video' | 'sounds'

export default function VoiceSettingsModal({ onClose }: VoiceSettingsModalProps) {
  const {
    selectedInputDeviceId, selectedOutputDeviceId, setInputDevice, setOutputDevice,
    selectedVideoDeviceId, setVideoDevice, videoQuality, setVideoQuality
  } = useVoiceStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio')
  const [inputDevices, setInputDevices] = useState<DeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<DeviceInfo[]>([])
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)

  // Sound settings state
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

  // Camera preview
  useEffect(() => {
    if (activeTab !== 'video') return
    let stream: MediaStream | null = null
    let cancelled = false

    async function startPreview() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        setPreviewStream(stream)
        if (previewRef.current) {
          previewRef.current.srcObject = stream
        }
      } catch {
        // Camera unavailable
      }
    }
    startPreview()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      setPreviewStream(null)
    }
  }, [activeTab, selectedVideoDeviceId])

  const handleClose = () => {
    previewStream?.getTracks().forEach((t) => t.stop())
    onClose()
  }

  const handleToggleSounds = () => {
    const next = !soundsEnabled
    soundService.setEnabled(next)
    setSoundsEnabled(next)
  }

  const handleUpload = async (type: 'join' | 'leave', file: File) => {
    await soundService.setCustomSound(type, file)
    if (type === 'join') setHasCustomJoin(true)
    else setHasCustomLeave(true)
  }

  const handleReset = (type: 'join' | 'leave') => {
    soundService.clearCustomSound(type)
    if (type === 'join') setHasCustomJoin(false)
    else setHasCustomLeave(false)
  }

  const qualityOptions: { value: VideoQuality; label: string }[] = [
    { value: '1080p', label: '1080p (Full HD)' },
    { value: '720p', label: '720p (HD)' },
    { value: '480p', label: '480p' },
    { value: '360p', label: '360p' }
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={handleClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-[440px] animate-grow-in"
      >
        <h3 className="font-display text-lg text-sol-amber mb-4">Voice & Video Settings</h3>

        {/* Tab bar */}
        <div className="flex border-b border-sol-bg-elevated mb-4">
          {(['audio', 'video', 'sounds'] as SettingsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                activeTab === tab
                  ? 'text-sol-amber border-b-2 border-sol-amber'
                  : 'text-sol-text-muted hover:text-sol-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'audio' ? (
          <div className="flex flex-col gap-4">
            {/* Input Device */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Input Device</label>
              <select
                className="input-field"
                value={selectedInputDeviceId ?? ''}
                onChange={(e) => setInputDevice(e.target.value)}
              >
                {inputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Output Device */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Output Device</label>
              <select
                className="input-field"
                value={selectedOutputDeviceId ?? ''}
                onChange={(e) => setOutputDevice(e.target.value)}
              >
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        ) : activeTab === 'video' ? (
          <div className="flex flex-col gap-4">
            {/* Camera preview */}
            <div className="rounded-lg overflow-hidden bg-sol-bg aspect-video">
              <video
                ref={previewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            </div>

            {/* Camera Device */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Camera</label>
              <select
                className="input-field"
                value={selectedVideoDeviceId ?? ''}
                onChange={(e) => setVideoDevice(e.target.value)}
              >
                {videoDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Video Quality */}
            <div>
              <label className="block text-xs text-sol-text-secondary mb-1 uppercase tracking-wider">Video Quality</label>
              <select
                className="input-field"
                value={videoQuality}
                onChange={(e) => setVideoQuality(e.target.value as VideoQuality)}
              >
                {qualityOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Enable/disable toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-sol-text-primary">Notification Sounds</label>
              <button
                onClick={handleToggleSounds}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  soundsEnabled ? 'bg-sol-green' : 'bg-sol-bg-elevated'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    soundsEnabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Join sound */}
            <SoundRow
              label="Join Sound"
              hasCustom={hasCustomJoin}
              onPreview={() => soundService.previewSound('join')}
              onUpload={() => joinInputRef.current?.click()}
              onReset={() => handleReset('join')}
            />
            <input
              ref={joinInputRef}
              type="file"
              accept=".mp3,.wav,.ogg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload('join', file)
                e.target.value = ''
              }}
            />

            {/* Leave sound */}
            <SoundRow
              label="Leave Sound"
              hasCustom={hasCustomLeave}
              onPreview={() => soundService.previewSound('leave')}
              onUpload={() => leaveInputRef.current?.click()}
              onReset={() => handleReset('leave')}
            />
            <input
              ref={leaveInputRef}
              type="file"
              accept=".mp3,.wav,.ogg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload('leave', file)
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SoundRow({
  label,
  hasCustom,
  onPreview,
  onUpload,
  onReset
}: {
  label: string
  hasCustom: boolean
  onPreview: () => void
  onUpload: () => void
  onReset: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-sm text-sol-text-primary">{label}</span>
        <span className="text-xs text-sol-text-muted">{hasCustom ? 'Custom' : 'Default'}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onPreview}
          className="px-2 py-1 text-xs rounded bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary transition-colors"
          title="Preview"
        >
          Preview
        </button>
        <button
          onClick={onUpload}
          className="px-2 py-1 text-xs rounded bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary transition-colors"
          title="Upload custom sound"
        >
          Upload
        </button>
        {hasCustom && (
          <button
            onClick={onReset}
            className="px-2 py-1 text-xs rounded bg-sol-bg-elevated text-sol-red hover:text-sol-red/80 transition-colors"
            title="Reset to default"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
