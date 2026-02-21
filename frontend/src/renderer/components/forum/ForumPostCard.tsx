import type { ForumPost } from '@renderer/types/models'
import { resolveAttachmentUrl } from '@renderer/services/api'

interface ForumPostCardProps {
  post: ForumPost
  onClick: () => void
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function ForumPostCard({ post, onClick }: ForumPostCardProps) {
  const avatarUrl = post.author_avatar_url
    ? resolveAttachmentUrl(post.author_avatar_url)
    : null
  const displayName = post.author_display_name || post.author_username

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-sol-bg-secondary hover:bg-sol-bg-elevated border border-sol-bg-elevated hover:border-sol-amber/30 rounded-xl p-4 transition-all group"
    >
      {/* Pinned indicator */}
      {post.pinned && (
        <div className="flex items-center gap-1 text-sol-amber text-xs mb-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
          </svg>
          Pinned
        </div>
      )}

      {/* Title */}
      <h3 className="text-sol-text-primary font-medium text-sm group-hover:text-sol-amber transition-colors line-clamp-2">
        {post.title}
      </h3>

      {/* Content preview */}
      {post.content_preview && (
        <p className="text-sol-text-muted text-xs mt-1 line-clamp-2">
          {post.content_preview}
        </p>
      )}

      {/* Tags */}
      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {post.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono"
              style={{
                backgroundColor: tag.color ? `${tag.color}20` : 'rgb(var(--sol-bg-elevated))',
                color: tag.color || 'rgb(var(--sol-text-secondary))',
                border: `1px solid ${tag.color ? `${tag.color}40` : 'rgb(var(--sol-bg-elevated))'}`
              }}
            >
              {tag.emoji && <span>{tag.emoji}</span>}
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer: author + stats */}
      <div className="flex items-center justify-between mt-3 text-xs text-sol-text-muted">
        <div className="flex items-center gap-2">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-4 h-4 rounded-full" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-sol-bg-elevated" />
          )}
          <span>{displayName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {post.reply_count}
          </span>
          <span>{timeAgo(post.last_activity_at)}</span>
        </div>
      </div>
    </button>
  )
}
