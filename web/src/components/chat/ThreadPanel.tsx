import { useEffect, useRef, useState } from 'react'
import { useThreadStore } from '@/stores/threadStore'
import { useAuthStore } from '@/stores/authStore'
import UserAvatar from '@/components/common/UserAvatar'
import MarkdownRenderer from './MarkdownRenderer'

export default function ThreadPanel() {
  const activeThread = useThreadStore((s) => s.activeThread)
  const threadMessages = useThreadStore((s) => s.threadMessages)
  const isLoadingMessages = useThreadStore((s) => s.isLoadingMessages)
  const isFetchingMore = useThreadStore((s) => s.isFetchingMore)
  const hasMore = useThreadStore((s) => s.hasMore)
  const closeThread = useThreadStore((s) => s.closeThread)
  const sendThreadMessage = useThreadStore((s) => s.sendThreadMessage)
  const fetchMoreThreadMessages = useThreadStore((s) => s.fetchMoreThreadMessages)

  const user = useAuthStore((s) => s.user)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)

  // Auto-scroll for new messages
  useEffect(() => {
    if (threadMessages.length === prevMessageCountRef.current + 1 && !isFetchingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = threadMessages.length
  }, [threadMessages.length, isFetchingMore])

  // Infinite scroll
  useEffect(() => {
    if (!activeThread || !sentinelRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          fetchMoreThreadMessages(activeThread.id)
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [activeThread, hasMore, isFetchingMore, fetchMoreThreadMessages])

  if (!activeThread) return null

  const handleSend = async () => {
    const content = input.trim()
    if (!content) return
    setInput('')
    try {
      await sendThreadMessage(activeThread.id, content)
    } catch {
      // restore input on failure
      setInput(content)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const threadName = activeThread.name || 'Thread'
  const isLocked = activeThread.locked
  const isArchived = activeThread.archived

  return (
    <div className="w-80 border-l border-sol-bg-elevated flex flex-col bg-sol-bg-secondary">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-sol-bg-elevated shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted shrink-0">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <span className="font-medium text-sol-text-primary text-sm truncate">{threadName}</span>
          {isLocked && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-sol-text-muted shrink-0" aria-label="Locked">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3-9H9V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z" />
            </svg>
          )}
          {isArchived && (
            <span className="text-[10px] text-sol-text-muted bg-sol-bg-elevated px-1.5 py-0.5 rounded shrink-0">Archived</span>
          )}
        </div>
        <button
          onClick={closeThread}
          className="p-1 text-sol-text-muted hover:text-sol-text-primary transition-colors"
          title="Close Thread"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-2 flex flex-col-reverse">
        <div ref={messagesEndRef} />
        {isLoadingMessages && threadMessages.length === 0 && (
          <div className="text-center py-4 text-sol-text-muted text-sm">Loading...</div>
        )}
        {threadMessages.map((msg) => {
          const displayName = msg.author_display_name ?? msg.author_username
          const time = new Date(msg.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })
          const isOwn = msg.author_id === user?.id

          return (
            <div key={msg.id} className="flex gap-2 py-1.5 hover:bg-sol-bg-elevated/20 rounded-lg">
              <UserAvatar
                avatarUrl={msg.author_avatar_url}
                username={displayName}
                size="sm"
                className="w-8 h-8 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className={`font-medium text-xs ${isOwn ? 'text-sol-amber' : 'text-sol-text-primary'}`}>
                    {displayName}
                  </span>
                  <span className="text-[10px] font-mono text-sol-text-muted">{time}</span>
                </div>
                <div className="text-xs text-sol-text-primary/90">
                  <MarkdownRenderer content={msg.content} />
                </div>
              </div>
            </div>
          )
        })}
        <div ref={sentinelRef} className="h-1 shrink-0" />
        {isFetchingMore && (
          <div className="text-center py-2 text-sol-text-muted text-xs">Loading older messages...</div>
        )}
      </div>

      {/* Input */}
      {!isLocked && !isArchived ? (
        <div className="p-2 border-t border-sol-bg-elevated">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply in thread..."
            rows={1}
            className="w-full bg-sol-bg-tertiary text-sol-text-primary text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-sol-accent placeholder:text-sol-text-muted/50"
          />
        </div>
      ) : (
        <div className="p-2 border-t border-sol-bg-elevated text-center text-xs text-sol-text-muted">
          {isLocked ? 'This thread is locked.' : 'This thread is archived.'}
        </div>
      )}
    </div>
  )
}
