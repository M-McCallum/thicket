import { useState, useEffect, useRef } from 'react'
import type { StickerPack, Sticker } from '@/types/models'
import { stickers as stickersApi, resolveAttachmentUrl } from '@/services/api'

interface StickerPickerProps {
  onSelect: (stickerId: string) => void
  onClose: () => void
}

export default function StickerPicker({ onSelect, onClose }: StickerPickerProps) {
  const [packs, setPacks] = useState<StickerPack[]>([])
  const [activePackId, setActivePackId] = useState<string | null>(null)
  const [stickerList, setStickerList] = useState<Sticker[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  useEffect(() => {
    stickersApi.getPacks().then((p) => {
      setPacks(p)
      if (p.length > 0) setActivePackId(p[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!activePackId) return
    setIsLoading(true)
    stickersApi.getStickers(activePackId).then(setStickerList).catch(() => {}).finally(() => setIsLoading(false))
  }, [activePackId])

  return (
    <div ref={ref} className="absolute bottom-full mb-2 right-0 z-50 w-72 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl shadow-xl overflow-hidden">
      {/* Pack tabs */}
      <div className="flex gap-1 p-2 border-b border-sol-bg-elevated overflow-x-auto">
        {packs.map((pack) => (
          <button
            key={pack.id}
            onClick={() => setActivePackId(pack.id)}
            className={`px-2 py-1 text-xs rounded-lg whitespace-nowrap ${
              activePackId === pack.id
                ? 'bg-sol-amber/20 text-sol-amber'
                : 'text-sol-text-secondary hover:bg-sol-bg-elevated'
            }`}
          >
            {pack.name}
          </button>
        ))}
      </div>

      {/* Sticker grid */}
      <div className="h-48 overflow-y-auto p-2">
        {packs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sol-text-muted text-sm">No sticker packs</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full text-sol-text-muted text-sm">Loading...</div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {stickerList.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => onSelect(sticker.id)}
                className="p-1 rounded-lg hover:bg-sol-bg-elevated transition-colors"
                title={sticker.name}
              >
                <img src={resolveAttachmentUrl(sticker.url)} alt={sticker.name} className="w-full aspect-square object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
