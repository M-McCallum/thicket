import { useState } from 'react'
import { useFriendStore } from '@/stores/friendStore'

interface AddFriendModalProps {
  onClose: () => void
}

export default function AddFriendModal({ onClose }: AddFriendModalProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const { sendRequest } = useFriendStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    try {
      await sendRequest(username.trim())
      setSuccess(true)
      setUsername('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
      >
        <h3 className="font-display text-lg text-sol-amber mb-2">Add Friend</h3>
        <p className="text-sol-text-muted text-sm mb-4">Enter their username to send a friend request.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field mb-3"
            placeholder="Username"
            autoFocus
            required
          />
          {error && <p className="text-sol-coral text-sm mb-3">{error}</p>}
          {success && <p className="text-sol-sage text-sm mb-3">Friend request sent!</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-danger">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!username.trim()}>
              Send Request
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
