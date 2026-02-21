import { useState } from 'react'
import type { Attachment } from '@renderer/types/models'
import { resolveAttachmentUrl } from '@renderer/services/api'

interface AttachmentPreviewProps {
  attachments: Attachment[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentPreview({ attachments }: AttachmentPreviewProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  if (!attachments || attachments.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-1">
        {attachments.map((att) => {
          const isImage = att.content_type.startsWith('image/')
          const isVideo = att.content_type.startsWith('video/')
          const isAudio = att.content_type.startsWith('audio/')

          if (isImage) {
            return (
              <button key={att.id} onClick={() => setLightboxUrl(resolveAttachmentUrl(att.url))} className="block text-left">
                <img
                  src={resolveAttachmentUrl(att.url)}
                  alt={att.original_filename}
                  className="max-w-xs max-h-64 rounded-lg border border-sol-bg-elevated object-contain hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
                <div className="text-xs text-sol-text-muted mt-0.5">{formatSize(att.size)}</div>
              </button>
            )
          }

          if (isVideo) {
            return (
              <div key={att.id}>
                <video
                  src={resolveAttachmentUrl(att.url)}
                  controls
                  className="max-w-sm max-h-64 rounded-lg border border-sol-bg-elevated"
                />
                <div className="text-xs text-sol-text-muted mt-0.5">{att.original_filename} · {formatSize(att.size)}</div>
              </div>
            )
          }

          if (isAudio) {
            return (
              <div key={att.id} className="flex items-center gap-3 px-3 py-2 bg-sol-bg-elevated rounded-lg border border-sol-bg-elevated max-w-sm w-full">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-amber shrink-0">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-sol-text-primary truncate">{att.original_filename}</div>
                  <div className="text-xs text-sol-text-muted">{formatSize(att.size)}</div>
                  <audio src={resolveAttachmentUrl(att.url)} controls className="w-full mt-1 h-8" />
                </div>
              </div>
            )
          }

          return (
            <a
              key={att.id}
              href={resolveAttachmentUrl(att.url)}
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

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </>
  )
}
