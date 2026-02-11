import { useState } from 'react'

interface MessageInputProps {
  channelName: string
  onSend: (content: string) => Promise<void>
}

export default function MessageInput({ channelName, onSend }: MessageInputProps): JSX.Element {
  const [input, setInput] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    await onSend(trimmed)
    setInput('')
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 pb-4">
      <div className="flex items-center bg-cyber-bg-secondary rounded border border-cyber-bg-elevated focus-within:border-neon-cyan/30 transition-colors">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent px-4 py-3 text-cyber-text-primary placeholder-cyber-text-muted focus:outline-none"
          placeholder={`Message #${channelName}`}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-4 py-3 text-neon-cyan/50 hover:text-neon-cyan disabled:text-cyber-text-muted transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
          </svg>
        </button>
      </div>
    </form>
  )
}
