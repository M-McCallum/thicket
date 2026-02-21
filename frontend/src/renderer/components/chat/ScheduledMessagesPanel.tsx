import { useState, useEffect, useCallback } from 'react'
import { scheduledMessages } from '@renderer/services/api'
import type { ScheduledMessage } from '@renderer/types/models'

interface ScheduledMessagesPanelProps {
  onClose: () => void
}

export default function ScheduledMessagesPanel({ onClose }: ScheduledMessagesPanelProps) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editScheduledAt, setEditScheduledAt] = useState('')

  const fetchMessages = useCallback(async () => {
    try {
      const data = await scheduledMessages.list()
      setMessages(data)
    } catch (err) {
      console.error('Failed to fetch scheduled messages:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  const handleDelete = async (id: string) => {
    try {
      await scheduledMessages.delete(id)
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      console.error('Failed to delete scheduled message:', err)
    }
  }

  const startEdit = (msg: ScheduledMessage) => {
    setEditingId(msg.id)
    setEditContent(msg.content)
    // Format for datetime-local input
    const dt = new Date(msg.scheduled_at)
    setEditScheduledAt(formatDateTimeLocal(dt))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
    setEditScheduledAt('')
  }

  const handleUpdate = async (id: string) => {
    try {
      const scheduledAt = new Date(editScheduledAt).toISOString()
      const updated = await scheduledMessages.update(id, {
        content: editContent,
        scheduled_at: scheduledAt
      })
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)))
      cancelEdit()
    } catch (err) {
      console.error('Failed to update scheduled message:', err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-sol-bg-primary rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col border border-sol-bg-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-sol-bg-elevated">
          <h2 className="text-lg font-semibold text-sol-text-primary">Scheduled Messages</h2>
          <button
            onClick={onClose}
            className="text-sol-text-muted hover:text-sol-text-primary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <p className="text-sol-text-muted text-sm text-center py-4">Loading...</p>
          )}
          {!loading && messages.length === 0 && (
            <p className="text-sol-text-muted text-sm text-center py-4">No scheduled messages</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="bg-sol-bg-secondary rounded-lg p-3 border border-sol-bg-elevated">
              {editingId === msg.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-sol-bg-primary text-sol-text-primary rounded px-2 py-1.5 text-sm border border-sol-bg-elevated focus:outline-none focus:border-sol-amber/30 resize-none"
                    rows={3}
                  />
                  <input
                    type="datetime-local"
                    value={editScheduledAt}
                    onChange={(e) => setEditScheduledAt(e.target.value)}
                    className="w-full bg-sol-bg-primary text-sol-text-primary rounded px-2 py-1.5 text-sm border border-sol-bg-elevated focus:outline-none focus:border-sol-amber/30"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1 text-xs text-sol-text-muted hover:text-sol-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdate(msg.id)}
                      className="px-3 py-1 text-xs bg-sol-amber text-sol-bg-primary rounded hover:bg-sol-amber/80 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-sol-text-primary break-words">{msg.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-sol-text-muted">
                      Scheduled for {new Date(msg.scheduled_at).toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(msg)}
                        className="text-xs text-sol-text-muted hover:text-sol-amber transition-colors"
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="text-xs text-sol-text-muted hover:text-sol-coral transition-colors"
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
