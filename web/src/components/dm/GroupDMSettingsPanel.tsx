import { useState, useEffect } from 'react'
import { useDMStore } from '@/stores/dmStore'
import { useAuthStore } from '@/stores/authStore'
import { useFriendStore } from '@/stores/friendStore'

interface Props {
  conversationId: string
  onClose: () => void
}

export default function GroupDMSettingsPanel({ conversationId, onClose }: Props) {
  const conversations = useDMStore((s) => s.conversations)
  const renameConversation = useDMStore((s) => s.renameConversation)
  const addParticipant = useDMStore((s) => s.addParticipant)
  const removeParticipant = useDMStore((s) => s.removeParticipant)
  const user = useAuthStore((s) => s.user)
  const { friends, fetchFriends } = useFriendStore()

  const conversation = conversations.find((c) => c.id === conversationId)
  const [name, setName] = useState(conversation?.name ?? '')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [addSearch, setAddSearch] = useState('')

  useEffect(() => {
    fetchFriends()
  }, [])

  if (!conversation) return null

  const handleRename = async () => {
    try {
      await renameConversation(conversationId, name)
    } catch {
      // ignore
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      await removeParticipant(conversationId, userId)
    } catch {
      // ignore
    }
  }

  const handleAdd = async (userId: string) => {
    try {
      await addParticipant(conversationId, userId)
      setShowAddFriend(false)
      setAddSearch('')
    } catch {
      // ignore
    }
  }

  const participantIds = new Set(conversation.participants.map((p) => p.id))

  const availableFriends = friends
    .filter((f) => f.status === 'accepted')
    .filter((f) => !participantIds.has(f.requester_id) || !participantIds.has(f.addressee_id))
    .filter((f) => {
      if (!addSearch) return true
      const friendName = f.display_name ?? f.username
      return friendName.toLowerCase().includes(addSearch.toLowerCase())
    })

  return (
    <div className="w-64 border-l border-sol-bg-elevated bg-sol-bg-secondary flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sol-bg-elevated">
        <h3 className="text-sm font-semibold text-sol-text-primary">Group Settings</h3>
        <button
          onClick={onClose}
          className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Group name */}
      <div className="px-4 py-3 border-b border-sol-bg-elevated">
        <label className="text-xs text-sol-text-muted uppercase font-semibold mb-1 block">
          Group Name
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter group name..."
            className="flex-1 px-2 py-1 text-sm rounded bg-sol-bg-primary text-sol-text-primary placeholder-sol-text-muted border border-sol-bg-elevated focus:outline-none focus:border-sol-amber"
          />
          <button
            onClick={handleRename}
            className="px-2 py-1 text-xs rounded bg-sol-amber text-sol-bg-primary font-medium hover:bg-sol-amber/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* Participants */}
      <div className="px-4 py-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-sol-text-muted uppercase font-semibold">
            Members -- {conversation.participants.length}
          </span>
          <button
            onClick={() => setShowAddFriend(!showAddFriend)}
            className="text-sol-text-muted hover:text-sol-amber transition-colors"
            title="Add member"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
            </svg>
          </button>
        </div>

        {/* Add friend picker */}
        {showAddFriend && (
          <div className="mb-3 p-2 rounded bg-sol-bg-primary border border-sol-bg-elevated">
            <input
              type="text"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="Search friends..."
              className="w-full px-2 py-1 mb-2 text-xs rounded bg-sol-bg-secondary text-sol-text-primary placeholder-sol-text-muted border border-sol-bg-elevated focus:outline-none focus:border-sol-amber"
            />
            <div className="max-h-32 overflow-y-auto space-y-1">
              {availableFriends.length === 0 ? (
                <p className="text-sol-text-muted text-xs text-center py-2">No friends to add</p>
              ) : (
                availableFriends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => handleAdd(friend.requester_id)}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs text-sol-text-secondary hover:bg-sol-bg-elevated/50 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-sol-bg-elevated flex-shrink-0 flex items-center justify-center text-xs">
                      {(friend.display_name ?? friend.username).charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{friend.display_name ?? friend.username}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Participant list */}
        <div className="space-y-1">
          {conversation.participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sol-bg-elevated/50 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full bg-sol-bg-elevated flex-shrink-0 flex items-center justify-center text-xs font-medium">
                {(p.display_name ?? p.username).charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-sol-text-primary truncate flex-1">
                {p.display_name ?? p.username}
                {p.id === user?.id && (
                  <span className="text-sol-text-muted text-xs ml-1">(you)</span>
                )}
              </span>
              {p.id !== user?.id && (
                <button
                  onClick={() => handleRemove(p.id)}
                  className="opacity-0 group-hover:opacity-100 text-sol-text-muted hover:text-red-400 transition-all"
                  title="Remove from group"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
