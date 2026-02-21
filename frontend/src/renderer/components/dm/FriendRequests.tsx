import { useEffect } from 'react'
import { useFriendStore } from '@renderer/stores/friendStore'
import { useAuthStore } from '@renderer/stores/authStore'

export default function FriendRequests() {
  const { pendingRequests, fetchRequests, acceptRequest, declineRequest } = useFriendStore()
  const { user } = useAuthStore()

  useEffect(() => {
    fetchRequests()
  }, [])

  const incoming = pendingRequests.filter((r) => r.addressee_id === user?.id)
  const outgoing = pendingRequests.filter((r) => r.requester_id === user?.id)

  return (
    <div className="flex flex-col py-2">
      {pendingRequests.length === 0 ? (
        <p className="text-sol-text-muted text-sm font-mono px-4 py-2">No pending requests</p>
      ) : (
        <>
          {incoming.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1">
                <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
                  Incoming — {incoming.length}
                </span>
              </div>
              {incoming.map((req) => (
                <div key={req.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sol-bg-elevated/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex items-center justify-center text-xs font-medium text-sol-text-secondary">
                      {req.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-sol-text-primary">{req.username}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => acceptRequest(req.id)}
                      className="p-1.5 text-sol-sage hover:bg-sol-sage/20 rounded-lg transition-colors"
                      title="Accept"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </button>
                    <button
                      onClick={() => declineRequest(req.id)}
                      className="p-1.5 text-sol-coral hover:bg-sol-coral/20 rounded-lg transition-colors"
                      title="Decline"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {outgoing.length > 0 && (
            <div>
              <div className="px-3 py-1">
                <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
                  Outgoing — {outgoing.length}
                </span>
              </div>
              {outgoing.map((req) => (
                <div key={req.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sol-bg-elevated/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex items-center justify-center text-xs font-medium text-sol-text-secondary">
                      {req.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-sol-text-primary">{req.username}</span>
                  </div>
                  <span className="text-xs text-sol-text-muted">Pending</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
