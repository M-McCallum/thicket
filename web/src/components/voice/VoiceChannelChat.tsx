import { useState, useEffect, useRef } from 'react'
import { useVoiceStore } from '@/stores/voiceStore'
import { useMessageStore } from '@/stores/messageStore'
import { useAuthStore } from '@/stores/authStore'
import { wsService } from '@/services/ws'
import type { MessageCreateData } from '@/types/ws'
import type { Message } from '@/types/models'
import MessageItem from '@/components/chat/MessageItem'
import MessageInput from '@/components/chat/MessageInput'

export default function VoiceChannelChat() {
  const activeChannelId = useVoiceStore((s) => s.activeChannelId)
  const fetchMessages = useMessageStore((s) => s.fetchMessages)
  const sendMessage = useMessageStore((s) => s.sendMessage)
  const messages = useMessageStore((s) => s.messages)
  const addMessage = useMessageStore((s) => s.addMessage)
  const user = useAuthStore((s) => s.user)

  const [isOpen, setIsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  // Load messages when opened
  useEffect(() => {
    if (!isOpen || !activeChannelId) return
    fetchMessages(activeChannelId)
  }, [isOpen, activeChannelId, fetchMessages])

  // Subscribe to new messages via WS
  useEffect(() => {
    if (!isOpen || !activeChannelId) return

    wsService.subscribe(activeChannelId)

    const unsub = wsService.on('MESSAGE_CREATE', (data) => {
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
          author_avatar_url: msgData.author_avatar_url,
          author_display_name: msgData.author_display_name,
          attachments: msgData.attachments
        })
      }
    })

    return () => {
      wsService.unsubscribe(activeChannelId)
      unsub()
    }
  }, [isOpen, activeChannelId, addMessage])

  // Auto scroll on new message
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevCountRef.current = messages.length
  }, [messages.length])

  const handleSend = async (content: string, files?: File[], msgType?: string, largePendingIds?: string[]) => {
    if (!activeChannelId) return
    await sendMessage(activeChannelId, content, files, msgType, largePendingIds)
  }

  if (!activeChannelId) return null

  return (
    <div className="relative">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`p-1.5 rounded transition-colors ${
          isOpen
            ? 'bg-sol-amber/20 text-sol-amber'
            : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
        }`}
        title="Toggle voice channel chat"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 h-96 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl shadow-xl flex flex-col overflow-hidden animate-grow-in z-50">
          {/* Header */}
          <div className="px-3 py-2 border-b border-sol-bg-elevated flex items-center justify-between">
            <span className="text-xs font-mono text-sol-text-secondary uppercase tracking-wider">
              Voice Chat
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {messages.map((msg: Message) => (
              <MessageItem
                key={msg.id}
                message={msg}
                isOwn={msg.author_id === user?.id}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-sol-bg-elevated">
            <MessageInput channelName="voice chat" onSend={handleSend} />
          </div>
        </div>
      )}
    </div>
  )
}
