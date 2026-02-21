import { useState, useEffect, useRef, useCallback } from 'react'
import { gifs, type GifResult } from '@/services/api'

interface GifPickerProps {
  onSelect: (url: string) => void
  onClose: () => void
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GifResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const doSearch = useCallback(async (q: string) => {
    setIsLoading(true)
    try {
      const data = q.trim()
        ? await gifs.search(q.trim())
        : await gifs.trending()
      setResults(data.data)
    } catch {
      // ignore
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    doSearch('')
  }, [doSearch])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  return (
    <div ref={ref} className="absolute bottom-full mb-2 right-0 z-50 w-80 bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl shadow-xl overflow-hidden">
      <div className="p-2">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search GIFs..."
          className="w-full px-3 py-1.5 bg-sol-bg rounded-lg text-sm text-sol-text-primary placeholder-sol-text-muted focus:outline-none border border-sol-bg-elevated focus:border-sol-amber/30"
          autoFocus
        />
      </div>
      <div className="h-64 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sol-text-muted text-sm">Loading...</div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sol-text-muted text-sm">No results</div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {results.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.images.original.url)}
                className="rounded-lg overflow-hidden hover:ring-2 hover:ring-sol-amber/50 transition-all"
              >
                <img
                  src={gif.images.fixed_width_small.url}
                  alt={gif.title}
                  className="w-full h-24 object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
