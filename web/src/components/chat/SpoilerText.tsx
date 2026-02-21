import { useState } from 'react'

interface SpoilerTextProps {
  children: React.ReactNode
}

export default function SpoilerText({ children }: SpoilerTextProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <span
      className={`rounded px-0.5 cursor-pointer transition-all duration-200 ${
        revealed
          ? 'bg-tertiary/50 text-primary'
          : 'bg-tertiary text-transparent hover:bg-tertiary/80'
      }`}
      onClick={() => setRevealed((r) => !r)}
    >
      {children}
    </span>
  )
}
