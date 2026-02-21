import { useState, useEffect } from 'react'
import { linkPreviews } from '@/services/api'
import type { LinkPreview } from '@/types/models'

interface LinkPreviewCardProps {
  url: string
}

export default function LinkPreviewCard({ url }: LinkPreviewCardProps) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)

  useEffect(() => {
    let cancelled = false
    linkPreviews.get(url).then((data) => {
      if (!cancelled && data && (data.title || data.description)) {
        setPreview(data)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [url])

  if (!preview) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 mt-1.5 max-w-md p-3 rounded-lg border-l-4 border-sol-amber/40 bg-sol-bg-elevated/50 hover:bg-sol-bg-elevated/80 transition-colors"
    >
      {preview.image_url && preview.image_url.startsWith('https://') && (
        <img
          src={preview.image_url}
          alt=""
          className="w-20 h-20 rounded object-cover flex-shrink-0"
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        {preview.site_name && (
          <div className="text-xs text-sol-text-muted mb-0.5">{preview.site_name}</div>
        )}
        {preview.title && (
          <div className="text-sm font-medium text-sol-blue truncate">{preview.title}</div>
        )}
        {preview.description && (
          <div className="text-xs text-sol-text-secondary mt-0.5 line-clamp-2">{preview.description}</div>
        )}
      </div>
    </a>
  )
}
