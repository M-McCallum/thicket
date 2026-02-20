import type { Message } from '../../types/models'

interface MessageItemProps {
  message: Message
  isOwn: boolean
}

export default function MessageItem({ message, isOwn }: MessageItemProps): JSX.Element {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  const displayName = message.author_display_name ?? message.author_username ?? 'Unknown'

  return (
    <div className="flex gap-3 py-1.5 hover:bg-sol-bg-elevated/20 px-2 -mx-2 rounded-lg group">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-sol-bg-elevated flex-shrink-0 flex items-center justify-center text-sm font-medium text-sol-text-secondary">
        {displayName.charAt(0).toUpperCase()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`font-medium text-sm ${isOwn ? 'text-sol-amber' : 'text-sol-text-primary'}`}>
            {displayName}
          </span>
          <span className="text-xs font-mono text-sol-text-muted">{time}</span>
          {message.updated_at !== message.created_at && (
            <span className="text-xs text-sol-text-muted">(edited)</span>
          )}
        </div>
        <p className="text-sm text-sol-text-primary/90 break-words">{message.content}</p>
      </div>
    </div>
  )
}
