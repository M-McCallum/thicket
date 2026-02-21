import { useEffect, useRef, lazy, Suspense } from 'react'
import { useMessageStore } from '@/stores/messageStore'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import { wsService } from '@/services/ws'
import type { MessageCreateData } from '@/types/ws'
import MessageItem from './MessageItem'
import MessageInput from './MessageInput'

const PinnedMessagesPanel = lazy(() => import('./PinnedMessagesPanel'))

export default function ChatArea() {
  const { messages, fetchMessages, sendMessage, addMessage, clearMessages, showPinnedPanel, setShowPinnedPanel, fetchPinnedMessages } = useMessageStore()
  const { activeChannelId, channels } = useServerStore()
  const { user } = useAuthStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeChannel = channels.find((c) => c.id === activeChannelId)

  useEffect(() => {
    if (!activeChannelId) return

    clearMessages()
    fetchMessages(activeChannelId)

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
          type: msgData.type as 'text' | 'sticker' | undefined,
          reply_to_id: msgData.reply_to_id,
          reply_to: msgData.reply_to,
          reactions: [],
          created_at: msgData.created_at,
          updated_at: msgData.created_at,
          author_username: msgData.username,
          attachments: msgData.attachments
        })
      }
    })

    return () => {
      wsService.unsubscribe(activeChannelId)
      unsubMessage()
    }
  }, [activeChannelId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

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

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-sol-bg-tertiary">
        <p className="text-sol-text-muted font-mono">Select a channel</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex bg-sol-bg-tertiary">
      <div className="flex-1 flex flex-col">
        {/* Channel header */}
        <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center">
              <span className="text-sol-text-muted mr-2">#</span>
              <h3 className="font-medium text-sol-text-primary">{activeChannel?.name}</h3>
            </div>
            {activeChannel?.topic && (
              <>
                <div className="w-px h-5 bg-sol-bg-elevated" />
                <span className="text-xs text-sol-text-muted truncate">{activeChannel.topic}</span>
              </>
            )}
          </div>
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
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col-reverse">
          <div ref={messagesEndRef} />
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              isOwn={message.author_id === user?.id}
            />
          ))}
        </div>

        {/* Message input */}
        <MessageInput channelName={activeChannel?.name ?? 'channel'} onSend={handleSend} />
      </div>

      {/* Pinned messages panel */}
      {showPinnedPanel && (
        <Suspense fallback={null}>
          <PinnedMessagesPanel channelId={activeChannelId} onClose={() => setShowPinnedPanel(false)} />
        </Suspense>
      )}
    </div>
  )
}
