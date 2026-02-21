import { useEffect } from 'react'
import { useFriendStore } from '@renderer/stores/friendStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useAuthStore } from '@renderer/stores/authStore'

export default function FriendsList() {
  const { friends, fetchFriends, removeFriend } = useFriendStore()
  const { createConversation, setActiveConversation } = useDMStore()
  const { user } = useAuthStore()

  useEffect(() => {
    fetchFriends()
  }, [])

  const onlineFriends = friends.filter((f) => f.user_status === 'online')
  const offlineFriends = friends.filter((f) => f.user_status !== 'online')

  const handleMessage = async (friendUserId: string) => {
    const conv = await createConversation(friendUserId)
    setActiveConversation(conv.id)
  }

  const getFriendUserId = (f: typeof friends[0]) => {
    return f.requester_id === user?.id ? f.addressee_id : f.requester_id
  }

  const renderFriend = (f: typeof friends[0]) => {
    const friendUserId = getFriendUserId(f)
    return (
      <div
        key={f.id}
        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sol-bg-elevated/50 group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex items-center justify-center text-xs font-medium text-sol-text-secondary">
              {(f.display_name ?? f.username).charAt(0).toUpperCase()}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-sol-bg-secondary ${
                f.user_status === 'online' ? 'bg-sol-sage' : 'bg-sol-text-muted'
              }`}
            />
          </div>
          <div className="min-w-0">
            <span className="text-sm text-sol-text-primary truncate block">{f.display_name ?? f.username}</span>
            {f.display_name && (
              <span className="text-xs text-sol-text-muted">{f.username}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => handleMessage(friendUserId)}
            className="p-1.5 text-sol-text-muted hover:text-sol-amber rounded-lg hover:bg-sol-bg/50 transition-colors"
            title="Message"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </button>
          <button
            onClick={() => removeFriend(f.id)}
            className="p-1.5 text-sol-text-muted hover:text-sol-coral rounded-lg hover:bg-sol-bg/50 transition-colors"
            title="Remove friend"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col py-2">
      {friends.length === 0 ? (
        <p className="text-sol-text-muted text-sm font-mono px-4 py-2">No friends yet</p>
      ) : (
        <>
          {onlineFriends.length > 0 && (
            <div className="mb-2">
              <div className="px-3 py-1">
                <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
                  Online — {onlineFriends.length}
                </span>
              </div>
              {onlineFriends.map(renderFriend)}
            </div>
          )}
          {offlineFriends.length > 0 && (
            <div>
              <div className="px-3 py-1">
                <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
                  Offline — {offlineFriends.length}
                </span>
              </div>
              {offlineFriends.map(renderFriend)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
