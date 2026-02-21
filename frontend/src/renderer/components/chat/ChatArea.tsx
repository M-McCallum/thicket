import { useEffect, useRef, useCallback, useState, lazy, Suspense } from 'react'
import { useMessageStore } from '@renderer/stores/messageStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useThreadStore } from '@renderer/stores/threadStore'
import { wsService } from '@renderer/services/ws'
import { threads as threadsApi } from '@renderer/services/api'
import type { MessageCreateData } from '@renderer/types/ws'
import MessageItem from './MessageItem'
import MessageInput from './MessageInput'
import ExportButton from './ExportButton'
import PollCreator from './PollCreator'
import ForumChannelView from '@renderer/components/forum/ForumChannelView'
import { useSearchStore } from '@renderer/stores/searchStore'
import { useNotificationStore } from '@renderer/stores/notificationStore'
import { useLayoutStore } from '@renderer/stores/layoutStore'
import { readState } from '@renderer/services/api'

const PinnedMessagesPanel = lazy(() => import('./PinnedMessagesPanel'))
const ThreadPanel = lazy(() => import('./ThreadPanel'))
const FollowChannelModal = lazy(() => import('@renderer/components/server/FollowChannelModal'))

export default function ChatArea() {
  const fetchMessages = useMessageStore((s) => s.fetchMessages)
  const fetchMoreMessages = useMessageStore((s) => s.fetchMoreMessages)
  const sendMessage = useMessageStore((s) => s.sendMessage)
  const addMessage = useMessageStore((s) => s.addMessage)
  const clearMessages = useMessageStore((s) => s.clearMessages)
  const showPinnedPanel = useMessageStore((s) => s.showPinnedPanel)
  const setShowPinnedPanel = useMessageStore((s) => s.setShowPinnedPanel)
  const fetchPinnedMessages = useMessageStore((s) => s.fetchPinnedMessages)
  const messages = useMessageStore((s) => s.messages)
  const hasMore = useMessageStore((s) => s.hasMore)
  const isFetchingMore = useMessageStore((s) => s.isFetchingMore)
  const isJumpedState = useMessageStore((s) => s.isJumpedState)
  const jumpToDate = useMessageStore((s) => s.jumpToDate)
  const jumpToPresent = useMessageStore((s) => s.jumpToPresent)

  const activeChannelId = useServerStore((s) => s.activeChannelId)
  const channels = useServerStore((s) => s.channels)
  const user = useAuthStore((s) => s.user)
  const activeThread = useThreadStore((s) => s.activeThread)
  const setThreadsForChannel = useThreadStore((s) => s.setThreadsForChannel)
  const clearThreads = useThreadStore((s) => s.clearThreads)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const setSearchOpen = useSearchStore((s) => s.setOpen)
  const activeChannel = channels.find((c) => c.id === activeChannelId)

  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateInput, setDateInput] = useState('')
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [showFollowModal, setShowFollowModal] = useState(false)

  useEffect(() => {
    if (!activeChannelId) return

    clearMessages()
    clearThreads()
    fetchMessages(activeChannelId)
    fetchPinnedMessages(activeChannelId)

    // Fetch threads for this channel
    threadsApi.list(activeChannelId).then(setThreadsForChannel).catch(() => {})

    // Ack channel + clear unread
    readState.ackChannel(activeChannelId).catch(() => {})
    useNotificationStore.getState().clearUnread(activeChannelId)

    // Subscribe to channel via WebSocket
    wsService.subscribe(activeChannelId)

    const unsubMessage = wsService.on('MESSAGE_CREATE', (data) => {
      const msgData = data as MessageCreateData
      if (msgData.channel_id === activeChannelId) {
        addMessage({
          id: msgData.id,
          channel_id: msgData.channel_id,
          author_id: msgData.author_id,
          content: msgData.content,
          type: msgData.type as 'text' | 'poll' | undefined,
          reply_to_id: msgData.reply_to_id,
          reply_to: msgData.reply_to,
          reactions: [],
          created_at: msgData.created_at,
          updated_at: msgData.created_at,
          author_username: msgData.username,
          author_avatar_url: msgData.author_avatar_url,
          author_display_name: msgData.author_display_name,
          attachments: msgData.attachments
        })
      }
    })

    return () => {
      wsService.unsubscribe(activeChannelId)
      unsubMessage()
    }
  }, [activeChannelId])

  // Infinite scroll: IntersectionObserver on sentinel at top of messages
  useEffect(() => {
    if (!activeChannelId || !sentinelRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          fetchMoreMessages(activeChannelId)
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [activeChannelId, hasMore, isFetchingMore, fetchMoreMessages])

  // Auto-scroll to bottom only for new messages (not when loading older ones)
  const prevMessageCountRef = useRef(0)
  useEffect(() => {
    if (messages.length === prevMessageCountRef.current + 1 && !isFetchingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length, isFetchingMore])

  const handleSend = async (content: string, files?: File[], msgType?: string) => {
    if (!activeChannelId) return
    await sendMessage(activeChannelId, content, files, msgType)
  }

  const handleTogglePins = () => {
    if (!showPinnedPanel && activeChannelId) {
      fetchPinnedMessages(activeChannelId)
    }
    setShowPinnedPanel(!showPinnedPanel)
  }

  const handleJumpToDate = useCallback(() => {
    if (!activeChannelId || !dateInput) return
    const date = new Date(dateInput + 'T00:00:00')
    if (isNaN(date.getTime())) return
    jumpToDate(activeChannelId, date)
    setShowDatePicker(false)
    setDateInput('')
  }, [activeChannelId, dateInput, jumpToDate])

  const handleJumpToPresent = useCallback(() => {
    if (!activeChannelId) return
    jumpToPresent(activeChannelId)
  }, [activeChannelId, jumpToPresent])

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-sol-bg-tertiary">
        <p className="text-sol-text-muted font-mono">Select a channel</p>
      </div>
    )
  }

  // Forum channels render a completely different view
  if (activeChannel?.type === 'forum') {
    return (
      <ForumChannelView
        channelId={activeChannelId}
        channelName={activeChannel.name}
      />
    )
  }

  return (
    <main className="flex-1 flex bg-sol-bg-tertiary" role="main">
      <div className="flex-1 flex flex-col">
        {/* Channel header */}
        <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => useLayoutStore.getState().toggleSidebar()}
              className="lg:hidden p-1.5 -ml-1.5 rounded text-sol-text-muted hover:text-sol-text-primary transition-colors"
              aria-label="Open sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex items-center">
              {activeChannel?.is_announcement ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted mr-2 shrink-0">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                </svg>
              ) : (
                <span className="text-sol-text-muted mr-2">#</span>
              )}
              <h3 className="font-medium text-sol-text-primary">{activeChannel?.name}</h3>
            </div>
            {activeChannel?.topic && (
              <>
                <div className="w-px h-5 bg-sol-bg-elevated" />
                <span className="text-xs text-sol-text-muted truncate">{activeChannel.topic}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Follow button for announcement channels */}
            {activeChannel?.is_announcement && (
              <button
                onClick={() => setShowFollowModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-sol-amber/10 text-sol-amber hover:bg-sol-amber/20 transition-colors"
                title="Follow this announcement channel"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                </svg>
                Follow
              </button>
            )}
            {/* Export button */}
            {activeChannelId && activeChannel && (
              <ExportButton channelId={activeChannelId} channelName={activeChannel.name} />
            )}
            {/* Jump to date button */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="p-1.5 rounded transition-colors text-sol-text-muted hover:text-sol-text-primary"
                title="Jump to Date"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-1 bg-sol-bg-elevated border border-sol-border rounded-lg shadow-lg p-3 z-50">
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="bg-sol-bg-tertiary text-sol-text-primary border border-sol-border rounded px-2 py-1 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleJumpToDate}
                      disabled={!dateInput}
                      className="text-xs px-3 py-1 bg-sol-accent text-white rounded hover:bg-sol-accent/80 disabled:opacity-50"
                    >
                      Jump
                    </button>
                    <button
                      onClick={() => { setShowDatePicker(false); setDateInput('') }}
                      className="text-xs px-3 py-1 text-sol-text-muted hover:text-sol-text-primary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded transition-colors text-sol-text-muted hover:text-sol-text-primary"
              title="Search (Ctrl+F)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              onClick={() => setShowPollCreator(!showPollCreator)}
              className={`p-1.5 rounded transition-colors ${showPollCreator ? 'text-sol-amber' : 'text-sol-text-muted hover:text-sol-text-primary'}`}
              title="Create Poll"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 10h10M4 14h6M4 18h12" />
              </svg>
            </button>
            <button
              onClick={handleTogglePins}
              className={`p-1.5 rounded transition-colors ${showPinnedPanel ? 'text-sol-amber' : 'text-sol-text-muted hover:text-sol-text-primary'}`}
              title="Pinned Messages"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
              </svg>
            </button>
            {/* Mobile members toggle */}
            <button
              onClick={() => useLayoutStore.getState().toggleMemberList()}
              className="lg:hidden p-1.5 rounded transition-colors text-sol-text-muted hover:text-sol-text-primary"
              title="Members"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </button>
          </div>
        </div>

        {/* Jump to present banner */}
        {isJumpedState && (
          <button
            onClick={handleJumpToPresent}
            className="mx-4 mt-2 py-1.5 px-4 bg-sol-accent/20 text-sol-accent text-sm rounded-lg hover:bg-sol-accent/30 transition-colors text-center"
          >
            Viewing older messages — Jump to present
          </button>
        )}

        {/* Messages */}
        <div ref={scrollContainerRef} className="message-list flex-1 overflow-y-auto px-4 py-2 flex flex-col-reverse">
          <div ref={messagesEndRef} />
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              isOwn={message.author_id === user?.id}
            />
          ))}
          {/* Sentinel for infinite scroll — sits at the visual top (DOM bottom in flex-col-reverse) */}
          <div ref={sentinelRef} className="h-1 shrink-0" />
          {isFetchingMore && (
            <div className="text-center py-2 text-sol-text-muted text-sm">Loading older messages...</div>
          )}
        </div>

        {/* Poll creator */}
        {showPollCreator && activeChannelId && (
          <PollCreator
            channelId={activeChannelId}
            onClose={() => setShowPollCreator(false)}
            onCreated={() => {
              if (activeChannelId) fetchMessages(activeChannelId)
            }}
          />
        )}

        {/* Message input */}
        <MessageInput channelName={activeChannel?.name ?? 'channel'} onSend={handleSend} />
      </div>

      {/* Pinned messages panel */}
      {showPinnedPanel && (
        <Suspense fallback={null}>
          <PinnedMessagesPanel channelId={activeChannelId} onClose={() => setShowPinnedPanel(false)} />
        </Suspense>
      )}

      {/* Thread panel */}
      {activeThread && (
        <Suspense fallback={null}>
          <ThreadPanel />
        </Suspense>
      )}

      {/* Follow announcement channel modal */}
      {showFollowModal && activeChannel && (
        <Suspense fallback={null}>
          <FollowChannelModal
            sourceChannelId={activeChannel.id}
            sourceChannelName={activeChannel.name}
            onClose={() => setShowFollowModal(false)}
          />
        </Suspense>
      )}
    </main>
  )
}
