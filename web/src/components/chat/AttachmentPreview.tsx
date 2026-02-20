import type { Attachment } from '@/types/models'

interface AttachmentPreviewProps {
  attachments: Attachment[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentPreview({ attachments }: AttachmentPreviewProps) {
  if (!attachments || attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {attachments.map((att) => {
        const isImage = att.content_type.startsWith('image/')
        const isVideo = att.content_type.startsWith('video/')

        if (isImage) {
          return (
            <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={att.url}
                alt={att.original_filename}
                className="max-w-xs max-h-64 rounded-lg border border-sol-bg-elevated object-contain"
                loading="lazy"
              />
            </a>
          )
        }

        if (isVideo) {
          return (
            <video
              key={att.id}
              src={att.url}
              controls
              className="max-w-sm max-h-64 rounded-lg border border-sol-bg-elevated"
            />
          )
        }

        return (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-sol-bg-elevated rounded-lg border border-sol-bg-elevated hover:border-sol-amber/30 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted shrink-0">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
            <div className="min-w-0">
              <div className="text-sm text-sol-text-primary truncate">{att.original_filename}</div>
              <div className="text-xs text-sol-text-muted">{formatSize(att.size)}</div>
            </div>
          </a>
        )
      })}
    </div>
  )
}
