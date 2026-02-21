import { useState, useEffect, useRef, useCallback } from 'react'
import { gifs, type GifResult } from '@renderer/services/api'

interface GifPickerProps {
  onSelect: (url: string) => void
  onClose: () => void
}

const PAGE_SIZE = 30

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GifResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const loadingMore = useRef(false)
  const currentQuery = useRef('')

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const doSearch = useCallback(async (q: string, offset = 0) => {
    if (offset === 0) setIsLoading(true)
    loadingMore.current = offset > 0
    currentQuery.current = q
    try {
      const data = q.trim()
        ? await gifs.search(q.trim(), PAGE_SIZE, offset)
        : await gifs.trending(PAGE_SIZE, offset)
      if (currentQuery.current !== q) return
      setResults(prev => offset === 0 ? data.data : [...prev, ...data.data])
      setHasMore(data.data.length >= PAGE_SIZE)
    } catch {
      // ignore
    }
    setIsLoading(false)
    loadingMore.current = false
  }, [])

  useEffect(() => {
    doSearch('')
  }, [doSearch])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setHasMore(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || loadingMore.current || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      doSearch(query, results.length)
    }
  }

  return (
    <div ref={ref} className="absolute bottom-full mb-2 right-0 z-50 w-[28rem] bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl shadow-xl overflow-hidden">
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
      <div ref={scrollRef} onScroll={handleScroll} className="h-[28rem] overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sol-text-muted text-sm">Loading...</div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sol-text-muted text-sm">No results</div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
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
            {loadingMore.current && (
              <div className="col-span-3 flex justify-center py-2 text-sol-text-muted text-sm">Loading more...</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
