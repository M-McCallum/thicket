import { useState, useMemo, lazy, Suspense } from 'react'
import type { Message } from '@/types/models'
import AttachmentPreview from './AttachmentPreview'
import UserAvatar from '@/components/common/UserAvatar'
import UserProfilePopup from '@/components/profile/UserProfilePopup'
import MarkdownRenderer from './MarkdownRenderer'
import LinkPreviewCard from './LinkPreviewCard'
import { useMessageStore } from '@/stores/messageStore'
import { pins as pinsApi } from '@/services/api'

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
  const { setReplyingTo, toggleReaction } = useMessageStore()
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  const displayName = message.author_display_name ?? message.author_username ?? 'Unknown'
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

  const handlePin = async () => {
    try {
      await pinsApi.pin(message.channel_id, message.id)
    } catch {
      // ignore
    }
  }

  const handleAddEmoji = (emoji: string) => {
    setShowEmojiInput(false)
    toggleReaction(message.id, emoji)
  }

  return (
    <div className="flex gap-3 py-1.5 hover:bg-sol-bg-elevated/20 px-2 -mx-2 rounded-lg group relative">
      {/* Hover actions */}
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
        <button
          onClick={handlePin}
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
      </div>

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
      <button
        onClick={() => !isOwn && setShowProfile(true)}
        className="flex-shrink-0 hover:opacity-80 transition-opacity"
        type="button"
      >
        <UserAvatar avatarUrl={message.author_avatar_url} username={displayName} size="sm" className="w-10 h-10" />
      </button>

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
          <button
            onClick={() => !isOwn && setShowProfile(true)}
            className={`font-medium text-sm ${isOwn ? 'text-sol-amber' : 'text-sol-text-primary'} hover:underline`}
            type="button"
          >
            {displayName}
          </button>
          <span className="text-xs font-mono text-sol-text-muted">{time}</span>
          {message.updated_at !== message.created_at && (
            <button
              onClick={() => setShowEditHistory(true)}
              className="text-xs text-sol-text-muted hover:text-sol-text-secondary hover:underline"
            >
              (edited)
            </button>
          )}
        </div>
        {isSticker ? (
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
    </div>
  )
}
