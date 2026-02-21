import { useState } from 'react'

interface ModerationActionModalProps {
  action: 'kick' | 'ban' | 'timeout'
  username: string
  onConfirm: (reason: string, duration?: number) => Promise<void>
  onClose: () => void
}

const TIMEOUT_OPTIONS = [
  { label: '60 seconds', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '1 hour', value: 3600 },
  { label: '1 day', value: 86400 },
  { label: '1 week', value: 604800 },
]

export default function ModerationActionModal({ action, username, onConfirm, onClose }: ModerationActionModalProps) {
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState(300)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await onConfirm(reason, action === 'timeout' ? duration : undefined)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  const actionLabel = action === 'kick' ? 'Kick' : action === 'ban' ? 'Ban' : 'Timeout'

  const buttonClass = action === 'ban'
    ? 'bg-sol-coral/20 text-sol-coral hover:bg-sol-coral/30'
    : 'bg-sol-amber/20 text-sol-amber hover:bg-sol-amber/30'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
      <div
        className="bg-sol-bg-secondary rounded-xl shadow-xl w-[420px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-sol-text-primary mb-1">
          {actionLabel} {username}
        </h2>
        <p className="text-sm text-sol-text-muted mb-4">
          {action === 'ban' && 'This will ban the user and remove them from the server.'}
          {action === 'kick' && 'This will remove the user from the server. They can rejoin with an invite.'}
          {action === 'timeout' && 'This will prevent the user from sending messages for the specified duration.'}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Enter a reason..."
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30"
            />
          </div>

          {action === 'timeout' && (
            <div>
              <label className="block text-sm text-sol-text-secondary mb-1">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30"
              >
                {TIMEOUT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-sol-coral">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sol-text-muted hover:text-sol-text-primary transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={`px-4 py-2 rounded-lg disabled:opacity-50 transition-colors text-sm ${buttonClass}`}
            >
              {loading ? 'Processing...' : actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
