import { useState } from 'react'

interface InviteModalProps {
  inviteCode: string
  onClose: () => void
}

export default function InviteModal({ inviteCode, onClose }: InviteModalProps) {
  const [copied, setCopied] = useState(false)
  const inviteLink = `${window.location.origin}/invite/${inviteCode}`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
      >
        <h3 className="font-display text-lg text-sol-amber mb-4">Invite People</h3>
        <p className="text-sol-text-muted text-sm mb-3">Share this link to invite others to the server.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteLink}
            readOnly
            className="input-field flex-1 text-sm select-all"
          />
          <button
            onClick={handleCopy}
            className="btn-primary whitespace-nowrap"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="btn-danger">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
