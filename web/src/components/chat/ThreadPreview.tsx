import type { Thread } from '@/types/models'
import { useThreadStore } from '@/stores/threadStore'

interface ThreadPreviewProps {
  thread: Thread
}

export default function ThreadPreview({ thread }: ThreadPreviewProps) {
  const openThread = useThreadStore((s) => s.openThread)

  const replyCount = thread.message_count
  const label = replyCount === 1 ? '1 reply' : `${replyCount} replies`

  return (
    <button
      onClick={() => openThread(thread)}
      className="flex items-center gap-1.5 mt-1 text-xs text-sol-accent hover:text-sol-accent/80 hover:underline transition-colors"
      type="button"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
      <span className="font-medium">{label}</span>
      {thread.last_message_at && (
        <span className="text-sol-text-muted">
          Last reply {new Date(thread.last_message_at).toLocaleDateString()}
        </span>
      )}
    </button>
  )
}
