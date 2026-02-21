import { useMessageStore } from '@renderer/stores/messageStore'
import { pins as pinsApi } from '@renderer/services/api'

interface PinnedMessagesPanelProps {
  channelId: string
  onClose: () => void
}

export default function PinnedMessagesPanel({ channelId, onClose }: PinnedMessagesPanelProps) {
  const pinnedMessages = useMessageStore((s) => s.pinnedMessages)

  const handleUnpin = async (messageId: string) => {
    try {
      await pinsApi.unpin(channelId, messageId)
    } catch {
      // ignore
    }
  }

  return (
    <div className="w-full sm:w-80 border-l border-sol-bg-elevated flex flex-col bg-sol-bg-secondary">
      <div className="h-12 flex items-center justify-between px-4 border-b border-sol-bg-elevated">
        <h3 className="font-medium text-sol-text-primary text-sm">Pinned Messages</h3>
        <button
          onClick={onClose}
          className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {pinnedMessages.length === 0 ? (
          <p className="text-sm text-sol-text-muted text-center mt-8">No pinned messages</p>
        ) : (
          <div className="space-y-2">
            {pinnedMessages.map((msg) => (
              <div key={msg.id} className="bg-sol-bg-elevated/50 rounded-lg p-3 group relative">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-medium text-sol-text-secondary">
                    {msg.author_display_name ?? msg.author_username ?? 'Unknown'}
                  </span>
                  <span className="text-xs font-mono text-sol-text-muted">
                    {new Date(msg.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-sol-text-primary/90 break-words">{msg.content}</p>
                <button
                  onClick={() => handleUnpin(msg.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-sol-text-muted hover:text-sol-coral text-xs transition-opacity"
                  title="Unpin"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
