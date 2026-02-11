import { useEffect, useRef, useState } from 'react'
import { useMessageStore } from '../../stores/messageStore'
import { useServerStore } from '../../stores/serverStore'
import { useAuthStore } from '../../stores/authStore'
import { wsService } from '../../services/ws'
import type { MessageCreateData } from '../../types/ws'
import MessageItem from './MessageItem'

export default function ChatArea(): JSX.Element {
  const { messages, fetchMessages, sendMessage, addMessage, clearMessages } = useMessageStore()
  const { activeChannelId, channels } = useServerStore()
  const { user } = useAuthStore()
  const [input, setInput] = useState('')
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
          created_at: msgData.created_at,
          updated_at: msgData.created_at,
          author_username: msgData.username
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !activeChannelId) return

    await sendMessage(activeChannelId, input.trim())
    setInput('')
  }

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cyber-bg-tertiary">
        <p className="text-cyber-text-muted font-mono">Select a channel</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-cyber-bg-tertiary">
      {/* Channel header */}
      <div className="h-12 flex items-center px-4 border-b border-cyber-bg-elevated">
        <span className="text-cyber-text-muted mr-2">#</span>
        <h3 className="font-medium text-cyber-text-primary">{activeChannel?.name}</h3>
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
      <form onSubmit={handleSend} className="px-4 pb-4">
        <div className="flex items-center bg-cyber-bg-secondary rounded border border-cyber-bg-elevated focus-within:border-neon-cyan/30 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent px-4 py-3 text-cyber-text-primary placeholder-cyber-text-muted focus:outline-none"
            placeholder={`Message #${activeChannel?.name ?? 'channel'}`}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-4 py-3 text-neon-cyan/50 hover:text-neon-cyan disabled:text-cyber-text-muted transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
