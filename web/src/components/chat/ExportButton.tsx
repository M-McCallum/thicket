import { useState, useRef, useEffect } from 'react'
import { exports } from '@/services/api'

interface ExportButtonProps {
  channelId: string
  channelName: string
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportButton({ channelId, channelName }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleExport = async (format: 'json' | 'html') => {
    setLoading(true)
    setOpen(false)
    try {
      const blob = await exports.channelMessages(channelId, format)
      const ext = format === 'html' ? 'html' : 'json'
      triggerDownload(blob, `${channelName}-export.${ext}`)
    } catch {
      // Silently fail — could add toast later
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="p-1.5 rounded transition-colors text-sol-text-muted hover:text-sol-text-primary disabled:opacity-50"
        title="Export Messages"
      >
        {loading ? (
          <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-sol-bg-elevated border border-sol-border rounded-lg shadow-lg z-50 min-w-[160px]">
          <button
            onClick={() => handleExport('json')}
            className="w-full px-3 py-2 text-left text-sm text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-tertiary rounded-t-lg transition-colors"
          >
            Export as JSON
          </button>
          <button
            onClick={() => handleExport('html')}
            className="w-full px-3 py-2 text-left text-sm text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-tertiary rounded-b-lg transition-colors"
          >
            Export as HTML
          </button>
        </div>
      )}
    </div>
  )
}
