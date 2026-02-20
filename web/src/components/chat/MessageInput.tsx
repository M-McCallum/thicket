import { useState, useRef, useCallback, lazy, Suspense } from 'react'

const EmojiPicker = lazy(() => import('./EmojiPicker'))
const GifPicker = lazy(() => import('./GifPicker'))
const StickerPicker = lazy(() => import('./StickerPicker'))

interface MessageInputProps {
  channelName: string
  onSend: (content: string, files?: File[], msgType?: string) => Promise<void>
}

export default function MessageInput({ channelName, onSend }: MessageInputProps) {
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  const [showSticker, setShowSticker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetHeight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    resetHeight()
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed && pendingFiles.length === 0) return
    await onSend(trimmed, pendingFiles.length > 0 ? pendingFiles : undefined)
    setInput('')
    setPendingFiles([])
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setPendingFiles((prev) => [...prev, ...files].slice(0, 10))
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    setPendingFiles((prev) => [...prev, ...files].slice(0, 10))
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (imageFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...imageFiles].slice(0, 10))
    }
  }

  const removeFile = (index: number) => {
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

  return (
    <div
      className="px-4 pb-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((file, i) => (
            <div key={i} className="relative group">
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-16 h-16 object-cover rounded-lg border border-sol-bg-elevated"
                />
              ) : (
                <div className="w-16 h-16 flex items-center justify-center rounded-lg border border-sol-bg-elevated bg-sol-bg-elevated">
                  <span className="text-xs text-sol-text-muted truncate px-1">{file.name.split('.').pop()}</span>
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
          className="flex-1 bg-transparent px-2 py-3 text-sol-text-primary placeholder-sol-text-muted focus:outline-none resize-none overflow-y-auto"
          style={{ maxHeight: '200px' }}
          placeholder={`Message #${channelName}`}
        />

        {/* Toolbar buttons */}
        <div className="flex items-center relative">
          <Suspense fallback={null}>
            {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />}
            {showGif && <GifPicker onSelect={handleGifSelect} onClose={() => setShowGif(false)} />}
            {showSticker && <StickerPicker onSelect={handleStickerSelect} onClose={() => setShowSticker(false)} />}
          </Suspense>

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

          <button
            type="button"
            onClick={() => { setShowGif(!showGif); setShowEmoji(false); setShowSticker(false) }}
            className="px-1.5 py-3 text-sol-text-muted hover:text-sol-amber transition-colors"
            title="GIF"
          >
            <span className="text-xs font-bold">GIF</span>
          </button>

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
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() && pendingFiles.length === 0}
          className="px-3 py-3 text-sol-amber/50 hover:text-sol-amber disabled:text-sol-text-muted transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
