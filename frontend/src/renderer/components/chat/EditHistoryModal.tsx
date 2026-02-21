import { useState, useEffect } from 'react'
import { messages as messagesApi } from '@renderer/services/api'
import type { MessageEdit } from '@renderer/types/models'
import MarkdownRenderer from './MarkdownRenderer'

interface EditHistoryModalProps {
  messageId: string
  onClose: () => void
}

export default function EditHistoryModal({ messageId, onClose }: EditHistoryModalProps) {
  const [edits, setEdits] = useState<MessageEdit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    messagesApi.edits(messageId).then((data) => {
      setEdits(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [messageId])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-sol-bg-secondary rounded-xl p-5 w-[480px] max-h-[70vh] shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit history"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-sol-text-primary">Edit History</h2>
          <button onClick={onClose} className="text-sol-text-muted hover:text-sol-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {loading ? (
            <p className="text-sm text-sol-text-muted">Loading...</p>
          ) : edits.length === 0 ? (
            <p className="text-sm text-sol-text-muted">No edit history found.</p>
          ) : (
            edits.map((edit) => (
              <div key={edit.id} className="border border-sol-bg-elevated rounded-lg p-3">
                <div className="text-xs text-sol-text-muted mb-1.5">
                  {new Date(edit.edited_at).toLocaleString()}
                </div>
                <div className="text-sm text-sol-text-primary/90">
                  <MarkdownRenderer content={edit.content} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
