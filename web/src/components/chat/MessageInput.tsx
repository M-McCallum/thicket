import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import { gifs, stickers as stickersApi, scheduledMessages, ApiError } from '@/services/api'
import { useMessageStore } from '@/stores/messageStore'
import { useServerStore } from '@/stores/serverStore'
import { useHasPermission } from '@/stores/permissionStore'
import { PermSendMessages } from '@/types/permissions'
import { isLargeFile, isFileTooLarge, uploadLargeFile, abortUpload, type UploadProgress } from '@/services/uploadService'

const EmojiPicker = lazy(() => import('./EmojiPicker'))
const GifPicker = lazy(() => import('./GifPicker'))
const StickerPicker = lazy(() => import('./StickerPicker'))
const ScheduledMessagesPanel = lazy(() => import('./ScheduledMessagesPanel'))

interface PendingFile {
  file: File
  isLarge: boolean
  uploadProgress?: UploadProgress
  pendingUploadId?: string
  abortController?: AbortController
}

interface MessageInputProps {
  channelName: string
  onSend: (content: string, files?: File[], msgType?: string, largePendingIds?: string[]) => Promise<void>
  channelId?: string
  dmConversationId?: string
}

// Cache feature availability across instances
let gifAvailable: boolean | null = null
let stickerAvailable: boolean | null = null

export function invalidateStickerCache() {
  stickerAvailable = null
}

export default function MessageInput({ channelName, onSend, channelId, dmConversationId }: MessageInputProps) {
  const canSend = useHasPermission(PermSendMessages)
  const { replyingTo, setReplyingTo } = useMessageStore()
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  const [showSticker, setShowSticker] = useState(false)
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)
  const [showScheduledPanel, setShowScheduledPanel] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [hasGifs, setHasGifs] = useState(gifAvailable ?? false)
  const [hasStickers, setHasStickers] = useState(stickerAvailable ?? false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [slowModeCountdown, setSlowModeCountdown] = useState(0)
  const [fileError, setFileError] = useState<string | null>(null)
  const slowModeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const members = useServerStore((s) => s.members)
  const activeServer = useServerStore((s) => s.servers.find((sv) => sv.id === s.activeServerId))
  const gifsEnabledOnServer = activeServer?.gifs_enabled !== false

  // Clean up slow mode timer on unmount
  useEffect(() => {
    return () => {
      if (slowModeTimerRef.current) clearInterval(slowModeTimerRef.current)
    }
  }, [])

  // Probe feature availability once
  useEffect(() => {
    if (gifAvailable === null) {
      gifs.trending(1, 0).then(() => {
        gifAvailable = true
        setHasGifs(true)
      }).catch(() => { gifAvailable = false })
    }
    if (stickerAvailable === null) {
      stickersApi.getPacks().then((packs) => {
        stickerAvailable = packs.length > 0
        setHasStickers(packs.length > 0)
      }).catch(() => { stickerAvailable = false })
    }
  }, [])

  const resetHeight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [])

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => m.username.toLowerCase().includes(q) || (m.display_name && m.display_name.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [mentionQuery, members])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    resetHeight()

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart
    const textBefore = value.slice(0, cursorPos)
    const atMatch = textBefore.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = useCallback((userId: string, username: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const cursorPos = ta.selectionStart
    const textBefore = input.slice(0, cursorPos)
    const atIndex = textBefore.lastIndexOf('@')
    if (atIndex === -1) return
    const before = input.slice(0, atIndex)
    const after = input.slice(cursorPos)
    const mention = `<@${userId}>`
    const newValue = before + mention + ' ' + after
    setInput(newValue)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const newPos = before.length + mention.length + 1
      ta.selectionStart = ta.selectionEnd = newPos
      ta.focus()
    })
  }, [input])

  const startSlowModeCountdown = useCallback((seconds: number) => {
    if (slowModeTimerRef.current) clearInterval(slowModeTimerRef.current)
    setSlowModeCountdown(seconds)
    slowModeTimerRef.current = setInterval(() => {
      setSlowModeCountdown((prev) => {
        if (prev <= 1) {
          if (slowModeTimerRef.current) clearInterval(slowModeTimerRef.current)
          slowModeTimerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // Start background upload for a large file
  const startLargeUpload = useCallback((pendingFile: PendingFile, index: number) => {
    const controller = new AbortController()

    setPendingFiles((prev) =>
      prev.map((f, i) => i === index ? { ...f, abortController: controller } : f)
    )

    uploadLargeFile(
      pendingFile.file,
      (progress) => {
        setPendingFiles((prev) =>
          prev.map((f, i) => i === index ? { ...f, uploadProgress: progress } : f)
        )
      },
      controller.signal
    )
      .then(({ pendingUploadId }) => {
        setPendingFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, pendingUploadId, uploadProgress: { ...f.uploadProgress!, status: 'done' } }
              : f
          )
        )
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setPendingFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, uploadProgress: { ...f.uploadProgress!, status: 'error', error: err.message } }
              : f
          )
        )
      })
  }, [])

  const addFiles = useCallback((files: File[]) => {
    setFileError(null)
    const newPending: PendingFile[] = []

    for (const file of files) {
      if (isFileTooLarge(file)) {
        setFileError(`${file.name} exceeds 500MB limit`)
        continue
      }
      newPending.push({
        file,
        isLarge: isLargeFile(file)
      })
    }

    setPendingFiles((prev) => {
      const combined = [...prev, ...newPending].slice(0, 10)
      // Start background uploads for newly added large files
      const startIndex = prev.length
      combined.forEach((pf, i) => {
        if (i >= startIndex && pf.isLarge && !pf.pendingUploadId && !pf.abortController) {
          // Use setTimeout to ensure state is updated first
          setTimeout(() => startLargeUpload(pf, i), 0)
        }
      })
      return combined
    })
  }, [startLargeUpload])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed && pendingFiles.length === 0) return
    if (slowModeCountdown > 0) return

    // Check if any large files are still uploading
    const stillUploading = pendingFiles.some(
      (f) => f.isLarge && f.uploadProgress?.status === 'uploading'
    )
    if (stillUploading) return

    // Check for failed large uploads
    const failedUploads = pendingFiles.some(
      (f) => f.isLarge && f.uploadProgress?.status === 'error'
    )
    if (failedUploads) return

    try {
      const smallFiles = pendingFiles.filter((f) => !f.isLarge).map((f) => f.file)
      const largePendingIds = pendingFiles
        .filter((f) => f.isLarge && f.pendingUploadId)
        .map((f) => f.pendingUploadId!)

      await onSend(
        trimmed,
        smallFiles.length > 0 ? smallFiles : undefined,
        undefined,
        largePendingIds.length > 0 ? largePendingIds : undefined
      )
      setInput('')
      setPendingFiles([])
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && err.retryAfter) {
        startSlowModeCountdown(err.retryAfter)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => Math.min(i + 1, filteredMembers.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        const member = filteredMembers[mentionIndex]
        if (member) insertMention(member.id, member.username)
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    addFiles(files)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (imageFiles.length > 0) {
      addFiles(imageFiles)
    }
  }

  const removeFile = (index: number) => {
    const file = pendingFiles[index]
    // If it's a large file with an active upload, abort it
    if (file.isLarge && file.abortController) {
      file.abortController.abort()
    }
    if (file.isLarge && file.pendingUploadId) {
      abortUpload(file.pendingUploadId).catch(() => {})
    }
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleEmojiSelect = (emoji: string) => {
    const ta = textareaRef.current
    if (ta) {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newValue = input.slice(0, start) + emoji + input.slice(end)
      setInput(newValue)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + emoji.length
        ta.focus()
      })
    } else {
      setInput((prev) => prev + emoji)
    }
    setShowEmoji(false)
  }

  const handleGifSelect = async (url: string) => {
    setShowGif(false)
    await onSend(url)
  }

  const handleStickerSelect = async (stickerId: string) => {
    setShowSticker(false)
    await onSend(stickerId, undefined, 'sticker')
  }

  const handleScheduleConfirm = async () => {
    const trimmed = input.trim()
    if (!trimmed || !scheduleDate) return
    try {
      const scheduledAt = new Date(scheduleDate).toISOString()
      await scheduledMessages.create({
        channel_id: channelId,
        dm_conversation_id: dmConversationId,
        content: trimmed,
        scheduled_at: scheduledAt
      })
      setInput('')
      setScheduleDate('')
      setShowSchedulePicker(false)
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      })
    } catch (err) {
      console.error('Failed to schedule message:', err)
    }
  }

  // Set default schedule date to 1 hour from now when opening the picker
  const openSchedulePicker = () => {
    if (!showSchedulePicker) {
      const now = new Date()
      now.setHours(now.getHours() + 1)
      const pad = (n: number) => String(n).padStart(2, '0')
      const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
      setScheduleDate(defaultDate)
    }
    setShowSchedulePicker(!showSchedulePicker)
  }

  // Compute whether send should be disabled
  const hasContent = input.trim().length > 0 || pendingFiles.length > 0
  const stillUploading = pendingFiles.some(
    (f) => f.isLarge && f.uploadProgress?.status === 'uploading'
  )
  const hasFailedUploads = pendingFiles.some(
    (f) => f.isLarge && f.uploadProgress?.status === 'error'
  )
  const sendDisabled = !hasContent || stillUploading || hasFailedUploads

  return (
    <div
      className="px-4 pb-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-2 mb-1 px-3 py-1.5 bg-sol-bg-secondary rounded-t-lg border border-b-0 border-sol-bg-elevated">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-amber flex-shrink-0">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 00-4-4H4" />
          </svg>
          <span className="text-xs text-sol-text-muted">Replying to</span>
          <span className="text-xs font-medium text-sol-text-secondary">
            {replyingTo.author_display_name ?? replyingTo.author_username ?? 'Unknown'}
          </span>
          <span className="text-xs text-sol-text-muted truncate flex-1">{replyingTo.content}</span>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-sol-text-muted hover:text-sol-text-primary transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* File error message */}
      {fileError && (
        <div className="mb-2 px-3 py-1.5 bg-sol-coral/10 border border-sol-coral/20 rounded text-xs text-sol-coral">
          {fileError}
        </div>
      )}

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative group">
              {pf.file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(pf.file)}
                  alt={pf.file.name}
                  className="w-16 h-16 object-cover rounded-lg border border-sol-bg-elevated"
                />
              ) : (
                <div className="w-16 h-16 flex items-center justify-center rounded-lg border border-sol-bg-elevated bg-sol-bg-elevated">
                  <span className="text-xs text-sol-text-muted truncate px-1">{pf.file.name.split('.').pop()}</span>
                </div>
              )}
              {/* Progress bar for large files */}
              {pf.isLarge && pf.uploadProgress && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-sol-bg-primary/50 rounded-b-lg overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      pf.uploadProgress.status === 'error' ? 'bg-sol-coral' :
                      pf.uploadProgress.status === 'done' ? 'bg-sol-green' :
                      'bg-sol-amber'
                    }`}
                    style={{
                      width: `${Math.round((pf.uploadProgress.uploadedBytes / pf.uploadProgress.totalBytes) * 100)}%`
                    }}
                  />
                </div>
              )}
              {/* Upload status indicator */}
              {pf.isLarge && pf.uploadProgress?.status === 'uploading' && (
                <div className="absolute top-0 left-0 right-0 text-center">
                  <span className="text-[9px] text-sol-amber bg-sol-bg-primary/80 px-1 rounded-b">
                    {Math.round((pf.uploadProgress.uploadedBytes / pf.uploadProgress.totalBytes) * 100)}%
                  </span>
                </div>
              )}
              {pf.isLarge && pf.uploadProgress?.status === 'error' && (
                <div className="absolute top-0 left-0 right-0 text-center">
                  <span className="text-[9px] text-sol-coral bg-sol-bg-primary/80 px-1 rounded-b">Failed</span>
                </div>
              )}
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-sol-coral rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* @mention autocomplete */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div className="mb-1 bg-sol-bg-secondary border border-sol-bg-elevated rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {filteredMembers.map((member, i) => (
            <button
              key={member.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(member.id, member.username) }}
              className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm transition-colors ${
                i === mentionIndex ? 'bg-sol-amber/10 text-sol-amber' : 'text-sol-text-secondary hover:bg-sol-bg-elevated'
              }`}
            >
              <span className="font-medium">{member.display_name || member.username}</span>
              {member.display_name && (
                <span className="text-xs text-sol-text-muted">{member.username}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end bg-sol-bg-secondary rounded-lg border border-sol-bg-elevated focus-within:border-sol-amber/30 transition-colors">
        {/* File upload button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-3 text-sol-text-muted hover:text-sol-amber transition-colors"
          title="Attach file"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={!canSend || slowModeCountdown > 0}
          aria-label={canSend ? `Message #${channelName}` : 'You do not have permission to send messages'}
          className="flex-1 bg-transparent px-2 py-3 text-sol-text-primary placeholder-sol-text-muted focus:outline-none resize-none overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ maxHeight: '200px' }}
          placeholder={slowModeCountdown > 0 ? `Slow mode active (${slowModeCountdown}s)` : canSend ? `Message #${channelName}` : 'You do not have permission to send messages'}
        />

        {/* Toolbar buttons */}
        <div className="flex items-center relative">
          <Suspense fallback={null}>
            {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />}
            {showGif && <GifPicker onSelect={handleGifSelect} onClose={() => setShowGif(false)} />}
            {showSticker && <StickerPicker onSelect={handleStickerSelect} onClose={() => setShowSticker(false)} />}
            {showScheduledPanel && <ScheduledMessagesPanel onClose={() => setShowScheduledPanel(false)} />}
          </Suspense>

          {/* Schedule picker popover */}
          {showSchedulePicker && (
            <div className="absolute bottom-full right-0 mb-2 bg-sol-bg-primary border border-sol-bg-elevated rounded-lg shadow-xl p-3 z-50 w-64">
              <p className="text-xs text-sol-text-muted mb-2">Schedule message for:</p>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full bg-sol-bg-secondary text-sol-text-primary rounded px-2 py-1.5 text-sm border border-sol-bg-elevated focus:outline-none focus:border-sol-amber/30 mb-2"
              />
              <div className="flex gap-2 justify-between">
                <button
                  type="button"
                  onClick={() => setShowScheduledPanel(true)}
                  className="text-xs text-sol-text-muted hover:text-sol-amber transition-colors"
                >
                  View scheduled
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSchedulePicker(false)}
                    className="px-2 py-1 text-xs text-sol-text-muted hover:text-sol-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleScheduleConfirm}
                    disabled={!input.trim() || !scheduleDate}
                    className="px-2 py-1 text-xs bg-sol-amber text-sol-bg-primary rounded hover:bg-sol-amber/80 disabled:opacity-50 transition-colors"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => { setShowEmoji(!showEmoji); setShowGif(false); setShowSticker(false) }}
            className="px-1.5 py-3 text-sol-text-muted hover:text-sol-amber transition-colors"
            title="Emoji"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>

          {hasGifs && gifsEnabledOnServer && (
            <button
              type="button"
              onClick={() => { setShowGif(!showGif); setShowEmoji(false); setShowSticker(false) }}
              className="px-1.5 py-3 text-sol-text-muted hover:text-sol-amber transition-colors"
              title="GIF"
            >
              <span className="text-xs font-bold">GIF</span>
            </button>
          )}

          {hasStickers && (
            <button
              type="button"
              onClick={() => { setShowSticker(!showSticker); setShowEmoji(false); setShowGif(false) }}
              className="px-1.5 py-3 text-sol-text-muted hover:text-sol-amber transition-colors"
              title="Sticker"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 1010 10h-10V2z" />
                <path d="M12 2v10h10" />
              </svg>
            </button>
          )}

          {/* Schedule message button */}
          <button
            type="button"
            onClick={openSchedulePicker}
            className={`px-1.5 py-3 transition-colors ${showSchedulePicker ? 'text-sol-amber' : 'text-sol-text-muted hover:text-sol-amber'}`}
            title="Schedule message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>

        {slowModeCountdown > 0 ? (
          <span className="px-3 py-3 text-xs font-mono text-sol-coral whitespace-nowrap">
            Slow mode: {slowModeCountdown}s
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={sendDisabled}
            className="px-3 py-3 text-sol-amber/50 hover:text-sol-amber disabled:text-sol-text-muted transition-colors"
          >
            {stillUploading ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="15" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
