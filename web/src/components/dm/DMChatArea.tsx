import { useEffect, useRef, useState, useCallback } from 'react'
import { useDMStore } from '@/stores/dmStore'
import { useAuthStore } from '@/stores/authStore'
import { useDMCallStore } from '@/stores/dmCallStore'
import { wsService } from '@/services/ws'
import { dm as dmApi } from '@/services/api'
import type { DMMessageCreateData } from '@/types/ws'
import type { Message, DMMessage } from '@/types/models'
import MessageItem from '@/components/chat/MessageItem'
import MessageInput from '@/components/chat/MessageInput'
import DMCallUI from './DMCallUI'
import GroupDMSettingsPanel from './GroupDMSettingsPanel'
import { useLayoutStore } from '@/stores/layoutStore'

export default function DMChatArea() {
  const messages = useDMStore((s) => s.messages)
  const activeConversationId = useDMStore((s) => s.activeConversationId)
  const conversations = useDMStore((s) => s.conversations)
  const hasMore = useDMStore((s) => s.hasMore)
  const isLoading = useDMStore((s) => s.isLoading)
  const replyingTo = useDMStore((s) => s.replyingTo)
  const pinnedMessages = useDMStore((s) => s.pinnedMessages)
  const showPinnedPanel = useDMStore((s) => s.showPinnedPanel)
  const { user } = useAuthStore()
  const { activeConversationId: callConvId } = useDMCallStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [showSettings, setShowSettings] = useState(false)

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const isGroup = activeConversation?.is_group ?? false

  const getConversationName = () => {
    if (!activeConversation) return 'Unknown'
    if (isGroup) {
      if (activeConversation.name) return activeConversation.name
      const others = activeConversation.participants
        .filter((p) => p.id !== user?.id)
        .map((p) => p.display_name ?? p.username)
      return others.join(', ') || 'Group DM'
    }
    const other = activeConversation.participants.find((p) => p.id !== user?.id)
    return other?.display_name ?? other?.username ?? 'Unknown'
  }

  const otherName = getConversationName()

  useEffect(() => {
    if (!activeConversationId) return

    useDMStore.getState().clearMessages()
    useDMStore.getState().fetchMessages(activeConversationId)
    useDMStore.getState().setShowPinnedPanel(false)
    useDMStore.getState().setReplyingTo(null)
    useDMStore.getState().setEditingMessageId(null)

    const unsubMessage = wsService.on('DM_MESSAGE_CREATE', (data) => {
      const msgData = data as DMMessageCreateData
      if (msgData.conversation_id === activeConversationId) {
        useDMStore.getState().addMessage({
          id: msgData.id,
          conversation_id: msgData.conversation_id,
          author_id: msgData.author_id,
          content: msgData.content,
          type: msgData.type as 'text' | undefined,
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
      unsubMessage()
    }
  }, [activeConversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Infinite scroll sentinel
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && activeConversationId) {
          const oldestMsg = messages[messages.length - 1]
          if (oldestMsg) {
            useDMStore.getState().fetchMessages(activeConversationId, oldestMsg.created_at)
          }
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, isLoading, messages.length, activeConversationId])

  const handleSend = async (content: string, files?: File[], msgType?: string, largePendingIds?: string[]) => {
    if (!activeConversationId) return
    const { replyingTo: rt } = useDMStore.getState()
    // For DM send with reply, we use the sendMessage API but include reply_to_id
    // The sendMessage in dmStore doesn't support reply_to_id directly, so call API
    if (rt) {
      let msg: DMMessage | null = null
      if (files && files.length > 0) {
        const fd = new FormData()
        fd.append('content', content)
        if (msgType) fd.append('type', msgType)
        fd.append('reply_to_id', rt.id)
        files.forEach((f) => fd.append('files[]', f))
        msg = await dmApi.sendMessage(activeConversationId, content, files, msgType)
      } else {
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
        const token = useAuthStore.getState().accessToken
        const res = await fetch(`${API_BASE}/dm/conversations/${activeConversationId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ content, type: msgType, reply_to_id: rt.id })
        })
        if (res.ok) {
          msg = await res.json()
        }
      }
      // Add message immediately so sender sees it without waiting for WS
      if (msg) {
        const currentUser = useAuthStore.getState().user
        useDMStore.getState().addMessage({
          id: msg.id,
          conversation_id: activeConversationId,
          author_id: msg.author_id,
          content: msg.content,
          type: msg.type as 'text' | undefined,
          reply_to_id: msg.reply_to_id,
          reactions: [],
          created_at: msg.created_at,
          updated_at: msg.updated_at,
          author_username: currentUser?.username,
          author_display_name: currentUser?.display_name,
          author_avatar_url: currentUser?.avatar_url,
        })
      }
      useDMStore.getState().setReplyingTo(null)
    } else {
      await useDMStore.getState().sendMessage(activeConversationId, content, files, msgType, largePendingIds)
    }
  }

  const handleTogglePins = useCallback(() => {
    const store = useDMStore.getState()
    const newShow = !store.showPinnedPanel
    store.setShowPinnedPanel(newShow)
    if (newShow && activeConversationId) {
      store.fetchPinnedMessages(activeConversationId)
    }
  }, [activeConversationId])

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-sol-bg-tertiary">
        <p className="text-sol-text-muted font-mono">Select a conversation</p>
      </div>
    )
  }

  // Map DMMessage to Message shape for reuse of MessageItem
  const mappedMessages: Message[] = messages.map((dm) => ({
    id: dm.id,
    channel_id: dm.conversation_id,
    author_id: dm.author_id,
    content: dm.content,
    type: dm.type,
    reply_to_id: dm.reply_to_id,
    reply_to: dm.reply_to ? {
      id: dm.reply_to.id,
      author_id: dm.reply_to.author_id,
      author_username: dm.reply_to.author_username,
      content: dm.reply_to.content
    } : undefined,
    reactions: dm.reactions?.map((r) => ({ emoji: r.emoji, count: r.count, me: r.me })),
    created_at: dm.created_at,
    updated_at: dm.updated_at,
    author_username: dm.author_username,
    author_display_name: dm.author_display_name,
    author_avatar_url: dm.author_avatar_url,
    attachments: dm.attachments
  }))

  const mappedPinnedMessages: Message[] = pinnedMessages.map((dm) => ({
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

  const handlePin = async (messageId: string) => {
    if (activeConversationId) {
      try {
        await dmApi.pinMessage(activeConversationId, messageId)
      } catch {
        // ignore
      }
    }
  }

  const handleUnpin = async (messageId: string) => {
    if (activeConversationId) {
      try {
        await dmApi.unpinMessage(activeConversationId, messageId)
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="flex-1 flex bg-sol-bg-tertiary">
      <div className="flex-1 flex flex-col">
        {/* DM header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-sol-bg-elevated">
          <div className="flex items-center">
            {/* Mobile hamburger */}
            <button
              onClick={() => useLayoutStore.getState().toggleSidebar()}
              className="lg:hidden p-1.5 -ml-1.5 mr-2 rounded text-sol-text-muted hover:text-sol-text-primary transition-colors"
              aria-label="Open sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-sol-text-muted mr-2">{isGroup ? '#' : '@'}</span>
            <h3 className="font-medium text-sol-text-primary">{otherName}</h3>
            {isGroup && (
              <span className="ml-2 text-xs text-sol-text-muted">
                {activeConversation?.participants.length} members
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleStartCall}
              className="p-2 text-sol-text-muted hover:text-sol-sage transition-colors"
              title="Start voice call"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
              </svg>
            </button>
            <button
              onClick={handleTogglePins}
              className={`p-2 transition-colors ${
                showPinnedPanel ? 'text-sol-amber' : 'text-sol-text-muted hover:text-sol-sage'
              }`}
              title="Pinned messages"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
              </svg>
            </button>
            {isGroup && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 transition-colors ${
                  showSettings ? 'text-sol-amber' : 'text-sol-text-muted hover:text-sol-sage'
                }`}
                title="Group settings"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Active call UI */}
        {callConvId === activeConversationId && <DMCallUI />}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col-reverse">
          <div ref={messagesEndRef} />
          {mappedMessages.map((message) => (
            <DMMessageItemWrapper
              key={message.id}
              message={message}
              isOwn={message.author_id === user?.id}
              onPin={handlePin}
            />
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="h-4 flex-shrink-0" />
          )}
        </div>

        {/* Reply bar */}
        {replyingTo && (
          <div className="px-4 py-2 bg-sol-bg-secondary border-t border-sol-bg-elevated flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted flex-shrink-0">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 00-4-4H4" />
            </svg>
            <span className="text-xs text-sol-text-muted">
              Replying to{' '}
              <span className="font-medium text-sol-text-secondary">
                {replyingTo.author_display_name ?? replyingTo.author_username}
              </span>
            </span>
            <span className="text-xs text-sol-text-muted truncate flex-1 max-w-[200px]">
              {replyingTo.content}
            </span>
            <button
              onClick={() => useDMStore.getState().setReplyingTo(null)}
              className="text-sol-text-muted hover:text-sol-text-primary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Message input */}
        <MessageInput channelName={otherName} onSend={handleSend} dmConversationId={activeConversationId ?? undefined} />
      </div>

      {/* Pinned messages panel */}
      {showPinnedPanel && (
        <div className="w-80 border-l border-sol-bg-elevated bg-sol-bg-secondary flex flex-col">
          <div className="h-12 flex items-center justify-between px-4 border-b border-sol-bg-elevated">
            <h4 className="font-medium text-sol-text-primary text-sm">Pinned Messages</h4>
            <button
              onClick={() => useDMStore.getState().setShowPinnedPanel(false)}
              className="text-sol-text-muted hover:text-sol-text-primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {mappedPinnedMessages.length === 0 ? (
              <p className="text-sm text-sol-text-muted text-center py-8">No pinned messages</p>
            ) : (
              mappedPinnedMessages.map((pm) => (
                <div key={pm.id} className="relative group mb-2">
                  <MessageItem message={pm} isOwn={pm.author_id === user?.id} />
                  <button
                    onClick={() => handleUnpin(pm.id)}
                    className="absolute top-1 right-1 hidden group-hover:block text-xs text-sol-text-muted hover:text-sol-red"
                    title="Unpin"
                  >
                    Unpin
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Group settings panel */}
      {showSettings && isGroup && activeConversationId && (
        <GroupDMSettingsPanel
          conversationId={activeConversationId}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

/**
 * Wrapper that provides DM-specific action handlers (edit/delete/react/pin/reply)
 * to the reusable MessageItem component via the dmStore instead of messageStore.
 */
function DMMessageItemWrapper({
  message,
  isOwn,
  onPin
}: {
  message: Message
  isOwn: boolean
  onPin: (messageId: string) => void
}) {
  return (
    <DMMessageItemInner message={message} isOwn={isOwn} onPin={onPin} />
  )
}

function DMMessageItemInner({
  message,
  isOwn,
  onPin
}: {
  message: Message
  isOwn: boolean
  onPin: (messageId: string) => void
}) {
  const [showEmojiInput, setShowEmojiInput] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editContent, setEditContent] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)

  const editingMessageId = useDMStore((s) => s.editingMessageId)
  const isEditing = editingMessageId === message.id

  const canDelete = isOwn
  const canEdit = isOwn

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
  const displayName = message.author_display_name ?? message.author_username ?? 'Unknown'
  const isGif = /^https?:\/\/.*\.(gif|gifv)(\?.*)?$/i.test(message.content) ||
    /^https?:\/\/media\d*\.giphy\.com\//i.test(message.content)

  const startEditing = () => {
    setEditContent(message.content)
    useDMStore.getState().setEditingMessageId(message.id)
  }

  const cancelEditing = () => {
    useDMStore.getState().setEditingMessageId(null)
    setEditContent('')
  }

  const saveEdit = () => {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed === message.content) {
      cancelEditing()
      return
    }
    useDMStore.getState().editMessage(message.id, trimmed)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  const handleDelete = () => {
    useDMStore.getState().deleteMessage(message.id)
    setShowDeleteConfirm(false)
  }

  const handleAddEmoji = (emoji: string) => {
    setShowEmojiInput(false)
    useDMStore.getState().toggleReaction(message.id, emoji)
  }

  const handleReply = () => {
    // Convert Message back to DMMessage shape for reply
    useDMStore.getState().setReplyingTo({
      id: message.id,
      conversation_id: message.channel_id,
      author_id: message.author_id,
      content: message.content,
      created_at: message.created_at,
      updated_at: message.updated_at,
      author_username: message.author_username,
      author_display_name: message.author_display_name,
      author_avatar_url: message.author_avatar_url
    })
  }

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.selectionStart = editRef.current.value.length
    }
  }, [isEditing])

  return (
    <div className="flex gap-3 py-1.5 hover:bg-sol-bg-elevated/20 px-2 -mx-2 rounded-lg group relative">
      {/* Hover actions */}
      {!isEditing && (
        <div className="absolute -top-3 right-2 hidden group-hover:flex gap-0.5 bg-sol-bg-secondary border border-sol-bg-elevated rounded-md shadow-lg z-10">
          <button
            onClick={handleReply}
            className="p-1.5 text-sol-text-muted hover:text-sol-amber transition-colors"
            title="Reply"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 00-4-4H4" />
            </svg>
          </button>
          {canEdit && (
            <button
              onClick={startEditing}
              className="p-1.5 text-sol-text-muted hover:text-sol-amber transition-colors"
              title="Edit"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onPin(message.id)}
            className="p-1.5 text-sol-text-muted hover:text-sol-amber transition-colors"
            title="Pin"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
            </svg>
          </button>
          <button
            onClick={() => setShowEmojiInput(!showEmojiInput)}
            className="p-1.5 text-sol-text-muted hover:text-sol-amber transition-colors"
            title="React"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          {canDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 text-sol-text-muted hover:text-sol-red transition-colors"
              title="Delete"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Quick emoji picker */}
      {showEmojiInput && (
        <div className="absolute -top-10 right-2 flex gap-1 bg-sol-bg-secondary border border-sol-bg-elevated rounded-md shadow-lg p-1 z-20">
          {['👍', '❤️', '😂', '😮', '😢', '🎉'].map((e) => (
            <button
              key={e}
              onClick={() => handleAddEmoji(e)}
              className="w-7 h-7 flex items-center justify-center hover:bg-sol-bg-elevated rounded text-sm"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-sol-bg-elevated flex items-center justify-center text-sol-text-muted text-sm font-medium overflow-hidden">
          {message.author_avatar_url ? (
            <img src={message.author_avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Reply reference */}
        {message.reply_to && (
          <div className="flex items-center gap-1.5 text-xs text-sol-text-muted mb-0.5 pl-2 border-l-2 border-sol-text-muted/30">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 00-4-4H4" />
            </svg>
            <span className="font-medium text-sol-text-secondary">{message.reply_to.author_username}</span>
            <span className="truncate max-w-[200px]">{message.reply_to.content}</span>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span className={`font-medium text-sm ${isOwn ? 'text-sol-amber' : 'text-sol-text-primary'}`}>
            {displayName}
          </span>
          <span className="text-xs font-mono text-sol-text-muted">{time}</span>
          {message.updated_at !== message.created_at && (
            <span className="text-xs text-sol-text-muted">(edited)</span>
          )}
        </div>

        {/* Edit mode */}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full bg-sol-bg/80 border border-sol-bg-elevated rounded-lg px-3 py-2 text-sm text-sol-text-primary resize-none focus:outline-none focus:border-sol-amber/50"
              rows={Math.min(editContent.split('\n').length + 1, 8)}
            />
            <div className="flex items-center gap-2 mt-1 text-xs text-sol-text-muted">
              <span>
                escape to{' '}
                <button onClick={cancelEditing} className="text-sol-accent-blue hover:underline">
                  cancel
                </button>
              </span>
              <span>
                enter to{' '}
                <button onClick={saveEdit} className="text-sol-accent-blue hover:underline">
                  save
                </button>
              </span>
            </div>
          </div>
        ) : isGif ? (
          <div className="mt-1">
            <img src={message.content} alt="GIF" className="max-w-xs rounded-lg" loading="lazy" />
          </div>
        ) : (
          <div className="text-sm text-sol-text-primary/90 whitespace-pre-wrap break-words">
            {message.content}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => useDMStore.getState().toggleReaction(message.id, r.emoji)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                  r.me
                    ? 'bg-sol-amber/10 border-sol-amber/30 text-sol-amber'
                    : 'bg-sol-bg-elevated/50 border-sol-bg-elevated text-sol-text-muted hover:border-sol-text-muted/50'
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-sol-bg-secondary rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium text-sol-text-primary mb-2">Delete Message</h3>
            <p className="text-sm text-sol-text-muted mb-4">Are you sure you want to delete this message?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-sol-text-muted hover:text-sol-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-sol-red text-white rounded hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
