import { useState } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useEventStore } from '@/stores/eventStore'
import { events as eventsApi } from '@/services/api'

interface CreateEventModalProps {
  onClose: () => void
}

export default function CreateEventModal({ onClose }: CreateEventModalProps) {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const channels = useServerStore((s) => s.channels)
  const addEvent = useEventStore((s) => s.addEvent)
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [locationType, setLocationType] = useState<'voice' | 'external'>('voice')
  const [channelId, setChannelId] = useState(voiceChannels[0]?.id || '')
  const [externalLocation, setExternalLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeServerId || !name.trim() || !startDate || !startTime) return

    setError('')
    setIsSubmitting(true)

    const startTimeISO = new Date(`${startDate}T${startTime}`).toISOString()
    let endTimeISO: string | undefined
    if (endDate && endTime) {
      endTimeISO = new Date(`${endDate}T${endTime}`).toISOString()
    }

    try {
      const event = await eventsApi.create(activeServerId, {
        name: name.trim(),
        description: description.trim(),
        location_type: locationType,
        channel_id: locationType === 'voice' ? channelId : undefined,
        external_location: locationType === 'external' ? externalLocation.trim() : undefined,
        start_time: startTimeISO,
        end_time: endTimeISO
      })
      addEvent(event)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-sol-bg-primary rounded-lg w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-sol-text-primary mb-4">Create Event</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                Event Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary placeholder-sol-text-secondary/50 focus:outline-none focus:border-sol-accent"
                placeholder="Event name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary placeholder-sol-text-secondary/50 focus:outline-none focus:border-sol-accent resize-none"
                placeholder="What's the event about?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-sol-text-secondary mb-2">
                Location Type
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLocationType('voice')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    locationType === 'voice'
                      ? 'bg-sol-accent text-white'
                      : 'bg-sol-bg-secondary text-sol-text-secondary hover:text-sol-text-primary'
                  }`}
                >
                  Voice Channel
                </button>
                <button
                  type="button"
                  onClick={() => setLocationType('external')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    locationType === 'external'
                      ? 'bg-sol-accent text-white'
                      : 'bg-sol-bg-secondary text-sol-text-secondary hover:text-sol-text-primary'
                  }`}
                >
                  External
                </button>
              </div>
            </div>

            {locationType === 'voice' && voiceChannels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                  Voice Channel
                </label>
                <select
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary focus:outline-none focus:border-sol-accent"
                >
                  {voiceChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {locationType === 'external' && (
              <div>
                <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={externalLocation}
                  onChange={(e) => setExternalLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary placeholder-sol-text-secondary/50 focus:outline-none focus:border-sol-accent"
                  placeholder="URL or location name"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary focus:outline-none focus:border-sol-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary focus:outline-none focus:border-sol-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary focus:outline-none focus:border-sol-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sol-text-secondary mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-primary focus:outline-none focus:border-sol-accent"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded text-sol-text-secondary hover:text-sol-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim() || !startDate || !startTime}
                className="px-4 py-2 rounded bg-sol-accent text-white font-medium hover:bg-sol-accent/80 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
