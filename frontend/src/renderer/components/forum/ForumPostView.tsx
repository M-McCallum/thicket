import { useEffect, useState, useCallback, useRef } from 'react'
import type { ForumPost, ForumPostMessage } from '@renderer/types/models'
import { forum as forumApi, resolveAttachmentUrl } from '@renderer/services/api'
import { useAuthStore } from '@renderer/stores/authStore'

interface ForumPostViewProps {
  postId: string
  onBack: () => void
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function ForumPostView({ postId, onBack }: ForumPostViewProps) {
  const [post, setPost] = useState<ForumPost | null>(null)
  const [messages, setMessages] = useState<ForumPostMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [replyContent, setReplyContent] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((s) => s.user)

  const fetchPost = useCallback(async () => {
    try {
      const [p, msgs] = await Promise.all([
        forumApi.getPost(postId),
        forumApi.getPostMessages(postId, 100)
      ])
      setPost(p)
      setMessages(msgs)
    } catch {
      // error ignored
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    fetchPost()
  }, [fetchPost])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleDelete = async () => {
    try {
      await forumApi.deletePost(postId)
      onBack()
    } catch {
      // error ignored
    }
  }

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyContent.trim() || sending) return
    setSending(true)
    try {
      const msg = await forumApi.createPostMessage(postId, replyContent.trim())
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
      setReplyContent('')
    } catch {
      // error ignored
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-sol-bg-tertiary">
        <p className="text-sol-text-muted text-sm">Loading post...</p>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex-1 flex items-center justify-center bg-sol-bg-tertiary">
        <p className="text-sol-text-muted text-sm">Post not found</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-sol-bg-tertiary">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated gap-3">
        <button
          onClick={onBack}
          className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h3 className="font-medium text-sol-text-primary truncate flex-1">{post.title}</h3>
        {post.pinned && (
          <span className="text-sol-amber text-xs flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
            </svg>
            Pinned
          </span>
        )}
        {user && post.author_id === user.id && (
          confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleDelete}
                className="text-xs text-sol-coral hover:text-sol-coral/80 font-medium"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-sol-text-muted hover:text-sol-text-primary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sol-text-muted hover:text-sol-coral transition-colors p-1"
              title="Delete post"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )
        )}
      </div>

      {/* Post info bar */}
      <div className="px-4 py-3 border-b border-sol-bg-elevated bg-sol-bg-secondary/50">
        <div className="flex items-center gap-2 mb-2">
          {post.author_avatar_url ? (
            <img src={resolveAttachmentUrl(post.author_avatar_url)} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-sol-bg-elevated" />
          )}
          <span className="text-sm text-sol-text-primary font-medium">
            {post.author_display_name || post.author_username}
          </span>
          <span className="text-xs text-sol-text-muted">{timeAgo(post.created_at)}</span>
        </div>
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.map((msg) => {
          const avatarUrl = msg.author_avatar_url
            ? resolveAttachmentUrl(msg.author_avatar_url)
            : null
          return (
            <div key={msg.id} className="flex gap-3 py-3 group hover:bg-sol-bg-secondary/30 rounded-lg px-2 -mx-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full shrink-0 mt-0.5" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-sol-bg-elevated shrink-0 mt-0.5 flex items-center justify-center text-sol-text-muted text-xs font-bold">
                  {(msg.author_display_name || msg.author_username).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-medium ${msg.author_id === user?.id ? 'text-sol-amber' : 'text-sol-text-primary'}`}>
                    {msg.author_display_name || msg.author_username}
                  </span>
                  <span className="text-[10px] text-sol-text-muted">{timeAgo(msg.created_at)}</span>
                  {msg.author_id === user?.id && (
                    confirmDeleteMsgId === msg.id ? (
                      <span className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={async () => {
                            try {
                              await forumApi.deletePostMessage(postId, msg.id)
                              setMessages((prev) => prev.filter((m) => m.id !== msg.id))
                            } catch { /* ignored */ }
                            setConfirmDeleteMsgId(null)
                          }}
                          className="text-[10px] text-sol-coral hover:text-sol-coral/80 font-medium"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteMsgId(null)}
                          className="text-[10px] text-sol-text-muted hover:text-sol-text-primary"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteMsgId(msg.id)}
                        className="ml-auto opacity-0 group-hover:opacity-100 text-sol-text-muted hover:text-sol-coral transition-all p-0.5"
                        title="Delete message"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    )
                  )}
                </div>
                <p className="text-sm text-sol-text-secondary whitespace-pre-wrap break-words mt-0.5">
                  {msg.content}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      <form onSubmit={handleReply} className="px-4 py-3 border-t border-sol-bg-elevated">
        <div className="flex gap-2">
          <input
            type="text"
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Reply to this post..."
            className="input-field flex-1"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!replyContent.trim() || sending}
            className="btn-primary disabled:opacity-50 px-4"
          >
            Reply
          </button>
        </div>
      </form>
    </div>
  )
}
