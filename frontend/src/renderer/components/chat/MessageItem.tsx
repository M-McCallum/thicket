import { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react'
import type { Message } from '@renderer/types/models'
import AttachmentPreview from './AttachmentPreview'
import UserAvatar from '@renderer/components/common/UserAvatar'
import UserProfilePopup from '@renderer/components/profile/UserProfilePopup'
import MarkdownRenderer from './MarkdownRenderer'
import LinkPreviewCard from './LinkPreviewCard'
import ThreadPreview from './ThreadPreview'
import PollDisplay from './PollDisplay'
import ConfirmDeleteModal from './ConfirmDeleteModal'
import { useMessageStore } from '@renderer/stores/messageStore'
import { useThreadStore } from '@renderer/stores/threadStore'
import { useFriendStore } from '@renderer/stores/friendStore'
import { useHasPermission, usePermissionStore } from '@renderer/stores/permissionStore'
import { PermManageMessages } from '@renderer/types/permissions'
import { pins as pinsApi, threads as threadsApi } from '@renderer/services/api'

const EditHistoryModal = lazy(() => import('./EditHistoryModal'))

const URL_REGEX = /https?:\/\/[^\s<]+/g

interface MessageItemProps {
  message: Message
  isOwn: boolean
}

export default function MessageItem({ message, isOwn }: MessageItemProps) {
  const [showProfile, setShowProfile] = useState(false)
  const [showEmojiInput, setShowEmojiInput] = useState(false)
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBlockedContent, setShowBlockedContent] = useState(false)
  const [editContent, setEditContent] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)

  // Close emoji picker on click outside or mouse leaving message area
  useEffect(() => {
    if (!showEmojiInput) return
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiInput(false)
      }
    }
    const handleMouseLeave = (e: MouseEvent) => {
      const msg = messageRef.current
      if (!msg) return
      const related = e.relatedTarget as Node | null
      if (!msg.contains(related)) {
        setShowEmojiInput(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    messageRef.current?.addEventListener('mouseleave', handleMouseLeave)
    const msgEl = messageRef.current
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      msgEl?.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [showEmojiInput])
  const { setReplyingTo, toggleReaction, editMessage, deleteMessage } = useMessageStore()
  const threadForMessage = useThreadStore((s) => s.threadsByMessage[message.id])
  const addThread = useThreadStore((s) => s.addThread)
  const openThread = useThreadStore((s) => s.openThread)
  const editingMessageId = useMessageStore((s) => s.editingMessageId)
  const setEditingMessageId = useMessageStore((s) => s.setEditingMessageId)
  const highlightedMessageId = useMessageStore((s) => s.highlightedMessageId)
  const canManageMessages = useHasPermission(PermManageMessages)
  const blockedUserIds = useFriendStore((s) => s.blockedUserIds)
  const isAuthorBlocked = blockedUserIds.has(message.author_id)
  const permRoles = usePermissionStore((s) => s.roles)
  const permMemberRoleIds = usePermissionStore((s) => s.memberRoleIds)

  // Compute the author's role color from their highest-positioned role that has a color
  const authorRoleColor = useMemo(() => {
    const ids = permMemberRoleIds[message.author_id] || []
    let highest: { color: string | null; position: number } | null = null
    for (const roleId of ids) {
      const role = permRoles.find((r) => r.id === roleId)
      if (role?.color && (!highest || role.position > highest.position)) {
        highest = role
      }
    }
    return highest?.color || null
  }, [permRoles, permMemberRoleIds, message.author_id])

  const isEditing = editingMessageId === message.id
  const isHighlighted = highlightedMessageId === message.id
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  const displayName = message.author_display_name ?? message.author_username ?? 'Unknown'
  const isPoll = message.type === 'poll'
  const isSticker = message.type === 'sticker'
  const isGif = !isSticker && /^https?:\/\/.*\.(gif|gifv)(\?.*)?$/i.test(message.content) ||
    /^https?:\/\/media\d*\.giphy\.com\//i.test(message.content)

  // Extract URLs for link previews (skip stickers/gifs)
  const previewUrls = useMemo(() => {
    if (isSticker || isGif) return []
    const matches = message.content.match(URL_REGEX)
    if (!matches) return []
    return [...new Set(matches)].slice(0, 3)
  }, [message.content, isSticker, isGif])

  const canDelete = isOwn || canManageMessages
  const canEdit = isOwn && !isSticker && !isGif

  const isPinned = useMessageStore((s) => s.pinnedMessageIds.has(message.id))

  const handlePin = async () => {
    try {
      if (isPinned) {
        await pinsApi.unpin(message.channel_id, message.id)
      } else {
        await pinsApi.pin(message.channel_id, message.id)
      }
    } catch {
      // ignore
    }
  }

  const handleCreateThread = async () => {
    if (threadForMessage) {
      openThread(threadForMessage)
      return
    }
    try {
      const thread = await threadsApi.create(message.channel_id, message.id)
      addThread(thread)
      openThread(thread)
    } catch {
      // ignore
    }
  }

  const handleAddEmoji = (emoji: string) => {
    setShowEmojiInput(false)
    toggleReaction(message.id, emoji)
  }

  const startEditing = () => {
    setEditContent(message.content)
    setEditingMessageId(message.id)
  }

  const cancelEditing = () => {
    setEditingMessageId(null)
    setEditContent('')
  }

  const saveEdit = () => {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed === message.content) {
      cancelEditing()
      return
    }
    editMessage(message.id, trimmed)
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
    deleteMessage(message.id)
    setShowDeleteConfirm(false)
  }

  // Auto-focus edit textarea
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.selectionStart = editRef.current.value.length
    }
  }, [isEditing])

  // Render blocked message placeholder
  if (isAuthorBlocked && !showBlockedContent) {
    return (
      <div className="flex gap-3 py-1.5 px-2 -mx-2 rounded-lg">
        <div className="flex-shrink-0 w-10 h-10" />
        <div className="flex items-center gap-2 text-sm text-sol-text-muted italic">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <span>Blocked message</span>
          <button
            onClick={() => setShowBlockedContent(true)}
            className="text-xs text-sol-text-muted hover:text-sol-text-secondary underline"
          >
            Show
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      role="article"
      aria-label={`Message from ${displayName} at ${time}`}
      ref={messageRef}
      className={`message-item flex gap-3 py-1.5 hover:bg-sol-bg-elevated/20 px-2 -mx-2 rounded-lg group relative transition-colors ${isHighlighted ? 'bg-sol-amber/20 duration-1000' : 'duration-75'} ${isAuthorBlocked ? 'opacity-50' : ''}`}
    >
      {/* Hover actions */}
      {!isEditing && (
        <div className="absolute -top-3 right-2 hidden group-hover:flex gap-0.5 bg-sol-bg-secondary border border-sol-bg-elevated rounded-md shadow-lg z-10">
          <button
            onClick={() => setReplyingTo(message)}
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
            onClick={handlePin}
            className={`p-1.5 transition-colors ${isPinned ? 'text-sol-amber' : 'text-sol-text-muted hover:text-sol-amber'}`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
            </svg>
          </button>
          <button
            onClick={handleCreateThread}
            className="p-1.5 text-sol-text-muted hover:text-sol-amber transition-colors"
            title={threadForMessage ? "View Thread" : "Create Thread"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
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
        <div ref={emojiPickerRef} className="absolute -top-10 right-2 flex gap-1 bg-sol-bg-secondary border border-sol-bg-elevated rounded-md shadow-lg p-1 z-20">
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
      <button
        onClick={() => !isOwn && setShowProfile(true)}
        className="flex-shrink-0 hover:opacity-80 transition-opacity"
        type="button"
      >
        <UserAvatar avatarUrl={message.author_avatar_url} username={displayName} size="sm" className="message-avatar w-10 h-10" />
      </button>

      {/* Content */}
      <div className="message-content-wrap flex-1 min-w-0">
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

        <div className="message-header flex items-baseline gap-2">
          <button
            onClick={() => !isOwn && setShowProfile(true)}
            className={`font-medium text-sm hover:underline ${
              !authorRoleColor ? (isOwn ? 'text-sol-amber' : 'text-sol-text-primary') : ''
            }`}
            style={authorRoleColor ? { color: authorRoleColor } : undefined}
            type="button"
          >
            {displayName}
          </button>
          <span className="text-xs font-mono text-sol-text-muted">{time}</span>
          {isPinned && (
            <span className="text-sol-amber text-xs flex items-center gap-0.5" title="Pinned message">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z" />
              </svg>
            </span>
          )}
          {message.updated_at !== message.created_at && (
            <button
              onClick={() => setShowEditHistory(true)}
              className="text-xs text-sol-text-muted hover:text-sol-text-secondary hover:underline"
            >
              (edited)
            </button>
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
        ) : isSticker ? (
          <div className="mt-1">
            <img
              src={message.content}
              alt="Sticker"
              className="w-36 h-36 object-contain"
              loading="lazy"
            />
          </div>
        ) : isGif ? (
          <div className="mt-1">
            <img
              src={message.content}
              alt="GIF"
              className="max-w-xs rounded-lg"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="text-sm text-sol-text-primary/90">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        {message.attachments && <AttachmentPreview attachments={message.attachments} />}

        {/* Poll */}
        {isPoll && (
          <PollDisplay messageId={message.id} initialPoll={message.poll} />
        )}

        {/* Link previews */}
        {previewUrls.map((url) => (
          <LinkPreviewCard key={url} url={url} />
        ))}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => toggleReaction(message.id, r.emoji)}
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

        {/* Thread preview */}
        {threadForMessage && threadForMessage.message_count > 0 && (
          <ThreadPreview thread={threadForMessage} />
        )}
      </div>

      {showProfile && (
        <UserProfilePopup
          userId={message.author_id}
          onClose={() => setShowProfile(false)}
          preloaded={{ display_name: message.author_display_name, username: message.author_username }}
        />
      )}

      {showEditHistory && (
        <Suspense fallback={null}>
          <EditHistoryModal messageId={message.id} onClose={() => setShowEditHistory(false)} />
        </Suspense>
      )}

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
