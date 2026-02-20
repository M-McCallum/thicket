import { useState, useEffect } from 'react'
import { Room } from 'livekit-client'
import { useVoiceStore } from '../../stores/voiceStore'

interface VoiceSettingsModalProps {
  onClose: () => void
}

interface DeviceInfo {
  deviceId: string
  label: string
}

export default function VoiceSettingsModal({ onClose }: VoiceSettingsModalProps) {
  const { selectedInputDeviceId, selectedOutputDeviceId, setInputDevice, setOutputDevice } = useVoiceStore()
  const [inputDevices, setInputDevices] = useState<DeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([])

  useEffect(() => {
    async function loadDevices() {
      const inputs = await Room.getLocalDevices('audioinput')
      const outputs = await Room.getLocalDevices('audiooutput')
      setInputDevices(inputs.map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)})` })))
      setOutputDevices(outputs.map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker (${d.deviceId.slice(0, 8)})` })))
    }
    loadDevices()
  }, [])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
      >
        <h3 className="font-display text-lg text-sol-amber mb-4">Voice Settings</h3>

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
      </div>
    </div>
  )
}
