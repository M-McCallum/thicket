import { useEffect, useRef } from 'react'
import { useDMStore } from '@/stores/dmStore'
import { useAuthStore } from '@/stores/authStore'
import { useDMCallStore } from '@/stores/dmCallStore'
import { wsService } from '@/services/ws'
import type { DMMessageCreateData } from '@/types/ws'
import MessageItem from '@/components/chat/MessageItem'
import MessageInput from '@/components/chat/MessageInput'
import DMCallUI from './DMCallUI'

export default function DMChatArea() {
  const { messages, activeConversationId, conversations, fetchMessages, sendMessage, addMessage, clearMessages } =
    useDMStore()
  const { user } = useAuthStore()
  const { activeConversationId: callConvId } = useDMCallStore()
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
          type: msgData.type as 'text' | 'sticker' | undefined,
          created_at: msgData.created_at,
          updated_at: msgData.created_at,
          author_username: msgData.username,
          attachments: msgData.attachments
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

  const handleSend = async (content: string, files?: File[], msgType?: string) => {
    if (!activeConversationId) return
    await sendMessage(activeConversationId, content, files, msgType)
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
    type: dm.type,
    created_at: dm.created_at,
    updated_at: dm.updated_at,
    author_username: dm.author_username,
    author_display_name: dm.author_display_name,
    author_avatar_url: dm.author_avatar_url,
    attachments: dm.attachments
  }))

  const handleStartCall = () => {
    if (activeConversationId) {
      useDMCallStore.getState().startCall(activeConversationId)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-sol-bg-tertiary">
      {/* DM header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-sol-bg-elevated">
        <div className="flex items-center">
          <span className="text-sol-text-muted mr-2">@</span>
          <h3 className="font-medium text-sol-text-primary">{otherName}</h3>
        </div>
        <button
          onClick={handleStartCall}
          className="p-2 text-sol-text-muted hover:text-sol-sage transition-colors"
          title="Start voice call"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
          </svg>
        </button>
      </div>

      {/* Active call UI */}
      {callConvId === activeConversationId && <DMCallUI />}

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
