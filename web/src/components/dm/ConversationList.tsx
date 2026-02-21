import { useEffect, useMemo, useState } from 'react'
import { useDMStore } from '@/stores/dmStore'
import { useAuthStore } from '@/stores/authStore'
import CreateGroupDMModal from './CreateGroupDMModal'

export default function ConversationList() {
  const conversations = useDMStore((s) => s.conversations)
  const activeConversationId = useDMStore((s) => s.activeConversationId)
  const fetchConversations = useDMStore((s) => s.fetchConversations)
  const setActiveConversation = useDMStore((s) => s.setActiveConversation)
  const acceptRequest = useDMStore((s) => s.acceptRequest)
  const declineRequest = useDMStore((s) => s.declineRequest)
  const { user } = useAuthStore()
  const [showGroupModal, setShowGroupModal] = useState(false)

  const acceptedConversations = useMemo(
    () => conversations.filter((c) => c.accepted),
    [conversations]
  )
  const pendingConversations = useMemo(
    () => conversations.filter((c) => !c.accepted),
    [conversations]
  )

  useEffect(() => {
    fetchConversations()
  }, [])

  const getDisplayName = (
    conv: (typeof conversations)[0]
  ) => {
    if (conv.is_group) {
      if (conv.name) return conv.name
      const others = conv.participants
        .filter((p) => p.id !== user?.id)
        .map((p) => p.display_name ?? p.username)
      return others.join(', ') || 'Group DM'
    }
    const other = conv.participants.find((p) => p.id !== user?.id)
    if (!other) return 'Unknown'
    return other.display_name ?? other.username
  }

  const getInitials = (conv: (typeof conversations)[0]) => {
    if (conv.is_group) {
      return String(conv.participants.length)
    }
    return getDisplayName(conv).charAt(0).toUpperCase()
  }

  const handleAccept = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation()
    try {
      await acceptRequest(conversationId)
    } catch {
      // ignore
    }
  }

  const handleDecline = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation()
    try {
      await declineRequest(conversationId)
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setShowGroupModal(true)}
        className="flex items-center gap-2 px-3 py-2 mx-2 mb-1 text-sm text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-elevated/50 rounded-lg transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
        </svg>
        <span>New Group DM</span>
      </button>

      {acceptedConversations.length === 0 && pendingConversations.length === 0 && (
        <div className="p-4">
          <p className="text-sol-text-muted text-sm font-mono">No conversations yet</p>
        </div>
      )}

      {acceptedConversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => setActiveConversation(conv.id)}
          className={`flex items-center gap-3 px-3 py-2 text-left transition-colors rounded-lg ${
            conv.id === activeConversationId
              ? 'bg-sol-bg-elevated text-sol-amber'
              : 'text-sol-text-secondary hover:bg-sol-bg-elevated/50 hover:text-sol-text-primary'
          }`}
        >
          <div className={`w-8 h-8 rounded-full bg-sol-bg-elevated flex-shrink-0 flex items-center justify-center text-xs font-medium ${
            conv.is_group ? 'rounded-lg' : ''
          }`}>
            {getInitials(conv)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {getDisplayName(conv)}
            </span>
            {conv.is_group && (
              <span className="text-xs text-sol-text-muted">
                {conv.participants.length} members
              </span>
            )}
          </div>
        </button>
      ))}

      {pendingConversations.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 py-2 mt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-sol-text-muted">
              Message Requests
            </span>
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-sol-amber/20 text-sol-amber text-xs font-bold">
              {pendingConversations.length}
            </span>
          </div>
          {pendingConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveConversation(conv.id)}
              className={`flex items-center gap-3 px-3 py-2 text-left transition-colors rounded-lg ${
                conv.id === activeConversationId
                  ? 'bg-sol-bg-elevated text-sol-amber'
                  : 'text-sol-text-secondary hover:bg-sol-bg-elevated/50 hover:text-sol-text-primary'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-sol-bg-elevated flex-shrink-0 flex items-center justify-center text-xs font-medium opacity-60">
                {getDisplayName(conv).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block opacity-60">
                  {getDisplayName(conv)}
                </span>
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={(e) => handleAccept(e, conv.id)}
                    className="px-2 py-0.5 text-xs rounded bg-sol-green/20 text-sol-green hover:bg-sol-green/30 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={(e) => handleDecline(e, conv.id)}
                    className="px-2 py-0.5 text-xs rounded bg-sol-red/20 text-sol-red hover:bg-sol-red/30 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </button>
          ))}
        </>
      )}

      {showGroupModal && (
        <CreateGroupDMModal onClose={() => setShowGroupModal(false)} />
      )}
    </div>
  )
}
