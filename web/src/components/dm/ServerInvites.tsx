import { useEffect } from 'react'
import { useServerInvitationStore } from '@/stores/serverInvitationStore'
import { useServerStore } from '@/stores/serverStore'

export default function ServerInvites() {
  const receivedInvitations = useServerInvitationStore((s) => s.receivedInvitations)
  const fetchReceived = useServerInvitationStore((s) => s.fetchReceived)
  const acceptInvitation = useServerInvitationStore((s) => s.acceptInvitation)
  const declineInvitation = useServerInvitationStore((s) => s.declineInvitation)

  useEffect(() => {
    fetchReceived()
  }, [])

  const handleAccept = async (id: string) => {
    try {
      await acceptInvitation(id)
      // Refresh server list after joining
      useServerStore.getState().fetchServers()
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col py-2">
      {receivedInvitations.length === 0 ? (
        <p className="text-sol-text-muted text-sm font-mono px-4 py-2">No pending server invites</p>
      ) : (
        <div>
          <div className="px-3 py-1">
            <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Server Invites — {receivedInvitations.length}
            </span>
          </div>
          {receivedInvitations.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sol-bg-elevated/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex items-center justify-center text-xs font-medium text-sol-text-secondary shrink-0">
                  {inv.server_icon_url ? (
                    <img src={inv.server_icon_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    inv.server_name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-sol-text-primary truncate">{inv.server_name}</p>
                  <p className="text-xs text-sol-text-muted truncate">Invited by {inv.sender_username}</p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleAccept(inv.id)}
                  className="p-1.5 text-sol-sage hover:bg-sol-sage/20 rounded-lg transition-colors"
                  title="Accept"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </button>
                <button
                  onClick={() => declineInvitation(inv.id)}
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
    </div>
  )
}
