import { useEffect, useRef } from 'react'
import Picker, { Theme, EmojiStyle } from 'emoji-picker-react'
import type { EmojiClickData } from 'emoji-picker-react'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div ref={ref} className="absolute bottom-full mb-2 right-0 z-50">
      <Picker
        onEmojiClick={(emojiData: EmojiClickData) => onSelect(emojiData.emoji)}
        theme={Theme.DARK}
        emojiStyle={EmojiStyle.NATIVE}
        previewConfig={{ showPreview: false }}
        skinTonesDisabled={false}
        searchPlaceHolder="Search emojis..."
        width={380}
        height={450}
      />
    </div>
  )
}
