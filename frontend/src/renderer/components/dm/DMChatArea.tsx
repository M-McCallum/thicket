import { useEffect, useRef } from 'react'
import { useDMStore } from '../../stores/dmStore'
import { useAuthStore } from '../../stores/authStore'
import { wsService } from '../../services/ws'
import type { DMMessageCreateData } from '../../types/ws'
import MessageItem from '../chat/MessageItem'
import MessageInput from '../chat/MessageInput'

export default function DMChatArea(): JSX.Element {
  const { messages, activeConversationId, conversations, fetchMessages, sendMessage, addMessage, clearMessages } =
    useDMStore()
  const { user } = useAuthStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const otherParticipant = activeConversation?.participants.find((p) => p.id !== user?.id)
  const otherName = otherParticipant?.display_name ?? otherParticipant?.username ?? 'Unknown'

  useEffect(() => {
    if (!activeConversationId) return

    clearMessages()
    fetchMessages(activeConversationId)

    const unsubMessage = wsService.on('DM_MESSAGE_CREATE', (data) => {
      const msgData = data as DMMessageCreateData
      if (msgData.conversation_id === activeConversationId) {
        addMessage({
          id: msgData.id,
          conversation_id: msgData.conversation_id,
          author_id: msgData.author_id,
          content: msgData.content,
          created_at: msgData.created_at,
          updated_at: msgData.created_at,
          author_username: msgData.username
        })
      }
    })

    return () => {
      unsubMessage()
    }
  }, [activeConversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async (content: string) => {
    if (!activeConversationId) return
    await sendMessage(activeConversationId, content)
  }

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-sol-bg-tertiary">
        <p className="text-sol-text-muted font-mono">Select a conversation</p>
      </div>
    )
  }

  // Map DMMessage to Message shape for reuse of MessageItem
  const mappedMessages = messages.map((dm) => ({
    id: dm.id,
    channel_id: dm.conversation_id,
    author_id: dm.author_id,
    content: dm.content,
    created_at: dm.created_at,
    updated_at: dm.updated_at,
    author_username: dm.author_username,
    author_display_name: dm.author_display_name,
    author_avatar_url: dm.author_avatar_url
  }))

  return (
    <div className="flex-1 flex flex-col bg-sol-bg-tertiary">
      {/* DM header */}
      <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated">
        <span className="text-sol-text-muted mr-2">@</span>
        <h3 className="font-medium text-sol-text-primary">{otherName}</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col-reverse">
        <div ref={messagesEndRef} />
        {mappedMessages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isOwn={message.author_id === user?.id}
          />
        ))}
      </div>

      {/* Message input */}
      <MessageInput channelName={otherName} onSend={handleSend} />
    </div>
  )
}
