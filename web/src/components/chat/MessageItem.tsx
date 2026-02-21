import type { Message } from '@/types/models'
import AttachmentPreview from './AttachmentPreview'

interface MessageItemProps {
  message: Message
  isOwn: boolean
}

export default function MessageItem({ message, isOwn }: MessageItemProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  const displayName = message.author_display_name ?? message.author_username ?? 'Unknown'
  const isSticker = message.type === 'sticker'
  const isGif = !isSticker && /^https?:\/\/.*\.(gif|gifv)(\?.*)?$/i.test(message.content) ||
    /^https?:\/\/media\d*\.giphy\.com\//i.test(message.content)

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
        {isSticker ? (
          <div className="mt-1">
            <img
              src={message.content}
              alt="Sticker"
              className="w-36 h-36 object-contain"
              loading="lazy"
            />
          </div>
        ) : isGif ? (
          <div className="mt-1">
            <img
              src={message.content}
              alt="GIF"
              className="max-w-xs rounded-lg"
              loading="lazy"
            />
          </div>
        ) : (
          <p className="text-sm text-sol-text-primary/90 break-words whitespace-pre-wrap">{message.content}</p>
        )}
        {message.attachments && <AttachmentPreview attachments={message.attachments} />}
      </div>
    </div>
  )
}
