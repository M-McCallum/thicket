import { useEffect, useState, lazy, Suspense } from 'react'
import { useEventStore } from '@/stores/eventStore'
import { useServerStore } from '@/stores/serverStore'
import type { ServerEvent } from '@/types/models'

const CreateEventModal = lazy(() => import('./CreateEventModal'))

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function EventCard({ event, serverId }: { event: ServerEvent; serverId: string }) {
  const { rsvp, removeRsvp } = useEventStore()
  const isPast = new Date(event.start_time) < new Date()
  const isActive = event.status === 'active'

  const handleRsvp = () => {
    if (event.user_rsvp) {
      removeRsvp(serverId, event.id)
    } else {
      rsvp(serverId, event.id, 'interested')
    }
  }

  return (
    <div className="bg-sol-bg-secondary rounded-lg p-4 border border-sol-bg-elevated hover:border-sol-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isActive && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-green-600/20 text-green-400 font-medium">
                LIVE
              </span>
            )}
            {isPast && event.status !== 'active' && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-sol-bg-elevated text-sol-text-secondary font-medium">
                ENDED
              </span>
            )}
            <span className="text-xs text-sol-accent font-medium">
              {formatEventDate(event.start_time)}
            </span>
          </div>
          <h3 className="font-semibold text-sol-text-primary truncate">{event.name}</h3>
          {event.description && (
            <p className="text-sm text-sol-text-secondary mt-1 line-clamp-2">{event.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-sol-text-secondary">
            <span>
              {event.location_type === 'external'
                ? event.external_location || 'External'
                : `Voice Channel`}
            </span>
            <span>by {event.creator_username}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-sol-bg-elevated">
        <span className="text-sm text-sol-text-secondary">
          {event.interested_count} interested
        </span>
        <button
          onClick={handleRsvp}
          disabled={isPast && event.status !== 'active'}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            event.user_rsvp
              ? 'bg-sol-accent/20 text-sol-accent border border-sol-accent/30'
              : 'bg-sol-accent text-white hover:bg-sol-accent/80'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {event.user_rsvp ? 'Interested' : 'Mark Interested'}
        </button>
      </div>
    </div>
  )
}

export default function EventsPanel() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const { events, isLoading, fetchEvents } = useEventStore()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (activeServerId) {
      fetchEvents(activeServerId)
    }
  }, [activeServerId, fetchEvents])

  const upcomingEvents = events.filter(
    (e) => e.status === 'scheduled' || e.status === 'active'
  )
  const pastEvents = events.filter(
    (e) => e.status === 'completed' || e.status === 'cancelled'
  )

  if (!activeServerId) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sol-bg-elevated">
        <h2 className="font-semibold text-sol-text-primary">Events</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded bg-sol-accent text-white text-sm font-medium hover:bg-sol-accent/80 transition-colors"
        >
          Create Event
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="text-center text-sol-text-secondary py-8">Loading events...</div>
        ) : upcomingEvents.length === 0 && pastEvents.length === 0 ? (
          <div className="text-center text-sol-text-secondary py-8">
            <p className="text-lg mb-1">No events yet</p>
            <p className="text-sm">Create an event to get started!</p>
          </div>
        ) : (
          <>
            {upcomingEvents.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-sol-text-secondary uppercase tracking-wider mb-3">
                  Upcoming
                </h3>
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <EventCard key={event.id} event={event} serverId={activeServerId} />
                  ))}
                </div>
              </div>
            )}
            {pastEvents.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-sol-text-secondary uppercase tracking-wider mb-3">
                  Past Events
                </h3>
                <div className="space-y-3">
                  {pastEvents.map((event) => (
                    <EventCard key={event.id} event={event} serverId={activeServerId} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <Suspense fallback={null}>
          <CreateEventModal onClose={() => setShowCreate(false)} />
        </Suspense>
      )}
    </div>
  )
}
