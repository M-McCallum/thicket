import { useEffect } from 'react'
import { useDMStore } from '../../stores/dmStore'
import { useAuthStore } from '../../stores/authStore'

export default function ConversationList(): JSX.Element {
  const { conversations, activeConversationId, fetchConversations, setActiveConversation } =
    useDMStore()
  const { user } = useAuthStore()

  useEffect(() => {
    fetchConversations()
  }, [])

  const getOtherParticipant = (
    participants: { id: string; username: string; display_name: string | null }[]
  ) => {
    const other = participants.find((p) => p.id !== user?.id)
    if (!other) return 'Unknown'
    return other.display_name ?? other.username
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4">
        <p className="text-cyber-text-muted text-sm font-mono">No conversations yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => setActiveConversation(conv.id)}
          className={`flex items-center gap-3 px-3 py-2 text-left transition-colors ${
            conv.id === activeConversationId
              ? 'bg-cyber-bg-elevated text-neon-cyan'
              : 'text-cyber-text-secondary hover:bg-cyber-bg-elevated/50 hover:text-cyber-text-primary'
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-cyber-bg-elevated flex-shrink-0 flex items-center justify-center text-xs font-medium">
            {getOtherParticipant(conv.participants).charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium truncate">
            {getOtherParticipant(conv.participants)}
          </span>
        </button>
      ))}
    </div>
  )
}
