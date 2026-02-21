import { useEffect, useRef, useCallback } from 'react'
import { useSearchStore } from '@/stores/searchStore'
import { useMessageStore } from '@/stores/messageStore'
import { useServerStore } from '@/stores/serverStore'
import UserAvatar from '@/components/common/UserAvatar'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function SearchModal() {
  const isOpen = useSearchStore((s) => s.isOpen)
  const query = useSearchStore((s) => s.query)
  const results = useSearchStore((s) => s.results)
  const isSearching = useSearchStore((s) => s.isSearching)
  const hasMore = useSearchStore((s) => s.hasMore)
  const scope = useSearchStore((s) => s.scope)
  const setOpen = useSearchStore((s) => s.setOpen)
  const setQuery = useSearchStore((s) => s.setQuery)
  const setScope = useSearchStore((s) => s.setScope)
  const performSearch = useSearchStore((s) => s.performSearch)
  const loadMore = useSearchStore((s) => s.loadMore)
  const clear = useSearchStore((s) => s.clear)

  const jumpToDate = useMessageStore((s) => s.jumpToDate)
  const setHighlightedMessageId = useMessageStore((s) => s.setHighlightedMessageId)

  const activeChannelId = useServerStore((s) => s.activeChannelId)
  const activeServerId = useServerStore((s) => s.activeServerId)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      clear()
    }
  }, [isOpen, clear])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) return
    debounceRef.current = setTimeout(() => {
      performSearch(activeChannelId ?? undefined, activeServerId ?? undefined)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, scope, activeChannelId, activeServerId, performSearch])

  // Ctrl+F / Cmd+F to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setOpen(!isOpen)
      }
      if (e.key === 'Escape' && isOpen) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setOpen])

  const handleJumpToResult = useCallback((result: typeof results[0]) => {
    if (!result.channel_id) return
    // Jump to the message's date in the channel
    const date = new Date(result.created_at)
    jumpToDate(result.channel_id, date)
    setHighlightedMessageId(result.id)
    setTimeout(() => setHighlightedMessageId(null), 3000)
    setOpen(false)
  }, [jumpToDate, setHighlightedMessageId, setOpen])

  // Infinite scroll in results
  const handleResultsScroll = useCallback(() => {
    const el = resultsRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      loadMore(activeChannelId ?? undefined, activeServerId ?? undefined)
    }
  }, [loadMore, activeChannelId, activeServerId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl bg-sol-bg-secondary rounded-lg shadow-xl border border-sol-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-sol-border">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-sol-text-primary outline-none placeholder:text-sol-text-muted"
          />
          {query && (
            <button onClick={clear} className="text-sol-text-muted hover:text-sol-text-primary text-sm">
              Clear
            </button>
          )}
        </div>

        {/* Scope toggle */}
        <div className="flex gap-1 px-4 py-2 border-b border-sol-border">
          {(['channel', 'server', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                scope === s
                  ? 'bg-sol-accent text-white'
                  : 'text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-elevated'
              }`}
            >
              {s === 'channel' ? 'This Channel' : s === 'server' ? 'This Server' : 'All Servers'}
            </button>
          ))}
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          onScroll={handleResultsScroll}
          className="max-h-96 overflow-y-auto"
        >
          {isSearching && results.length === 0 && (
            <div className="p-8 text-center text-sol-text-muted text-sm">Searching...</div>
          )}
          {!isSearching && query && results.length === 0 && (
            <div className="p-8 text-center text-sol-text-muted text-sm">No results found</div>
          )}
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => handleJumpToResult(result)}
              className="w-full text-left px-4 py-3 hover:bg-sol-bg-elevated transition-colors border-b border-sol-border/50 last:border-b-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <UserAvatar
                  username={result.author_username ?? ''}
                  avatarUrl={result.author_avatar_url ?? null}
                  size="sm"
                />
                <span className="text-sm font-medium text-sol-text-primary">
                  {result.author_display_name || result.author_username}
                </span>
                <span className="text-xs text-sol-text-muted">
                  {new Date(result.created_at).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
              <p className="text-sm text-sol-text-secondary line-clamp-2">{result.content}</p>
            </button>
          ))}
          {isSearching && results.length > 0 && (
            <div className="p-4 text-center text-sol-text-muted text-sm">Loading more...</div>
          )}
        </div>
      </div>
    </div>
  )
}
