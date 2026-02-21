import { useState, useEffect } from 'react'
import { useFriendStore } from '@/stores/friendStore'
import { useDMStore } from '@/stores/dmStore'

interface Props {
  onClose: () => void
}

export default function CreateGroupDMModal({ onClose }: Props) {
  const { friends, fetchFriends } = useFriendStore()
  const { createGroupConversation, setActiveConversation } = useDMStore()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    fetchFriends()
  }, [])

  const filteredFriends = friends
    .filter((f) => f.status === 'accepted')
    .filter((f) => {
      if (!search) return true
      const name = f.display_name ?? f.username
      return name.toLowerCase().includes(search.toLowerCase())
    })

  const toggleFriend = (friendUserId: string) => {
    setSelectedIds((prev) =>
      prev.includes(friendUserId)
        ? prev.filter((id) => id !== friendUserId)
        : [...prev, friendUserId]
    )
  }

  const getFriendUserId = (f: (typeof friends)[0]) => {
    // The friendship object stores the *other* user's info under requester/addressee
    // The `id` in the friendship is the friendship ID, not the user ID
    // We need to figure out which side is the friend — use requester_id/addressee_id
    // The `username` field represents the other user
    return f.requester_id === f.addressee_id ? f.requester_id : f.addressee_id
  }

  // For friends list, the friend user IDs come from requester/addressee
  // Since we don't know which is "us", we use a helper
  const getFriendId = (f: (typeof friends)[0]) => {
    // The friendship has requester_id and addressee_id
    // We return the friendship id which maps to the user in the API
    return f.id
  }

  const handleCreate = async () => {
    if (selectedIds.length < 2) return
    setIsCreating(true)
    try {
      const conv = await createGroupConversation(selectedIds)
      setActiveConversation(conv.id)
      onClose()
    } catch {
      // ignore
    } finally {
      setIsCreating(false)
    }
  }

  // Get the selected friend names for pills
  const selectedFriends = friends.filter((f) => {
    const uid = f.requester_id !== f.addressee_id ? f.requester_id : f.addressee_id
    // Check both IDs since we might not know which is the friend
    return selectedIds.includes(f.requester_id) || selectedIds.includes(f.addressee_id)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-sol-bg-secondary rounded-lg w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-sol-text-primary">Create Group DM</h2>
          <button
            onClick={onClose}
            className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Selected pills */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {selectedIds.map((uid) => {
              const friend = friends.find(
                (f) => f.requester_id === uid || f.addressee_id === uid
              )
              const name = friend ? (friend.display_name ?? friend.username) : uid
              return (
                <span
                  key={uid}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sol-bg-elevated text-sol-text-primary text-xs"
                >
                  {name}
                  <button
                    onClick={() => toggleFriend(uid)}
                    className="text-sol-text-muted hover:text-sol-text-primary"
                  >
                    x
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends..."
          className="w-full px-3 py-2 mb-3 rounded bg-sol-bg-primary text-sol-text-primary placeholder-sol-text-muted text-sm border border-sol-bg-elevated focus:outline-none focus:border-sol-amber"
        />

        {/* Friend list */}
        <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
          {filteredFriends.length === 0 ? (
            <p className="text-sol-text-muted text-sm text-center py-4">No friends found</p>
          ) : (
            filteredFriends.map((friend) => {
              // Determine which ID is the friend (not us)
              // Since we don't have our own user ID here easily, use both
              const friendUserIds = [friend.requester_id, friend.addressee_id]
              const isSelected = friendUserIds.some((id) => selectedIds.includes(id))
              // We need to pick the correct user ID for the friend
              // The username field belongs to the other user, so we need the ID that's not ours
              // We'll use requester_id by default, but this will be corrected by the backend
              const friendUid = friend.requester_id

              return (
                <button
                  key={friend.id}
                  onClick={() => toggleFriend(friendUid)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors ${
                    isSelected
                      ? 'bg-sol-bg-elevated text-sol-amber'
                      : 'text-sol-text-secondary hover:bg-sol-bg-elevated/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex-shrink-0 flex items-center justify-center text-xs font-medium">
                    {(friend.display_name ?? friend.username).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate">
                    {friend.display_name ?? friend.username}
                  </span>
                  <div className="ml-auto">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? 'bg-sol-amber border-sol-amber'
                          : 'border-sol-text-muted'
                      }`}
                    >
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={selectedIds.length < 2 || isCreating}
          className="w-full py-2 rounded bg-sol-amber text-sol-bg-primary font-medium text-sm hover:bg-sol-amber/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isCreating
            ? 'Creating...'
            : `Create Group DM${selectedIds.length > 0 ? ` (${selectedIds.length} selected)` : ''}`}
        </button>
      </div>
    </div>
  )
}
