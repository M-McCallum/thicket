import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchStore } from '@/stores/searchStore'
import type { SearchFilters } from '@/stores/searchStore'
import { useMessageStore } from '@/stores/messageStore'
import { useServerStore } from '@/stores/serverStore'
import UserAvatar from '@/components/common/UserAvatar'

export default function SearchModal() {
  const isOpen = useSearchStore((s) => s.isOpen)
  const query = useSearchStore((s) => s.query)
  const results = useSearchStore((s) => s.results)
  const isSearching = useSearchStore((s) => s.isSearching)
  const hasMore = useSearchStore((s) => s.hasMore)
  const scope = useSearchStore((s) => s.scope)
  const filters = useSearchStore((s) => s.filters)
  const setOpen = useSearchStore((s) => s.setOpen)
  const setQuery = useSearchStore((s) => s.setQuery)
  const setScope = useSearchStore((s) => s.setScope)
  const setFilters = useSearchStore((s) => s.setFilters)
  const performSearch = useSearchStore((s) => s.performSearch)
  const loadMore = useSearchStore((s) => s.loadMore)
  const clear = useSearchStore((s) => s.clear)

  const jumpToDate = useMessageStore((s) => s.jumpToDate)
  const setHighlightedMessageId = useMessageStore((s) => s.setHighlightedMessageId)

  const activeChannelId = useServerStore((s) => s.activeChannelId)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const members = useServerStore((s) => s.members)

  const [showFilters, setShowFilters] = useState(false)
  const [authorQuery, setAuthorQuery] = useState('')
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      clear()
      setShowFilters(false)
      setAuthorQuery('')
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
  }, [query, scope, filters, activeChannelId, activeServerId, performSearch])

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

  const updateFilter = useCallback((update: Partial<SearchFilters>) => {
    setFilters({ ...filters, ...update })
  }, [filters, setFilters])

  const filteredMembers = authorQuery
    ? members.filter((m) =>
        (m.username?.toLowerCase().includes(authorQuery.toLowerCase())) ||
        (m.display_name?.toLowerCase().includes(authorQuery.toLowerCase()))
      ).slice(0, 5)
    : []

  const selectedAuthor = filters.author_id
    ? members.find((m) => m.id === filters.author_id)
    : null

  const hasActiveFilters = filters.author_id || filters.has_attachment || filters.has_link || filters.date_from || filters.date_to

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

        {/* Scope toggle + filter toggle */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-sol-border">
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
          <div className="flex-1" />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1 text-xs rounded-full transition-colors flex items-center gap-1 ${
              showFilters || hasActiveFilters
                ? 'bg-sol-amber/20 text-sol-amber'
                : 'text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-elevated'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-sol-amber" />}
          </button>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="px-4 py-3 border-b border-sol-border space-y-2">
            <div className="flex flex-wrap gap-3">
              {/* Author filter */}
              <div className="relative">
                <label className="block text-[10px] text-sol-text-muted uppercase tracking-wider mb-1">Author</label>
                {selectedAuthor ? (
                  <div className="flex items-center gap-1.5 bg-sol-bg-elevated rounded-md px-2 py-1 text-xs text-sol-text-primary">
                    <span>{selectedAuthor.display_name || selectedAuthor.username}</span>
                    <button
                      onClick={() => {
                        updateFilter({ author_id: undefined })
                        setAuthorQuery('')
                      }}
                      className="text-sol-text-muted hover:text-sol-text-primary"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={authorQuery}
                    onChange={(e) => {
                      setAuthorQuery(e.target.value)
                      setShowAuthorDropdown(true)
                    }}
                    onFocus={() => setShowAuthorDropdown(true)}
                    placeholder="Username..."
                    className="w-32 bg-sol-bg-elevated border border-sol-border rounded-md px-2 py-1 text-xs text-sol-text-primary outline-none focus:border-sol-amber/30"
                  />
                )}
                {showAuthorDropdown && filteredMembers.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-sol-bg-elevated border border-sol-border rounded-md shadow-lg z-10 py-1">
                    {filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          updateFilter({ author_id: m.id })
                          setAuthorQuery('')
                          setShowAuthorDropdown(false)
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-sol-text-secondary hover:bg-sol-bg-secondary hover:text-sol-text-primary"
                      >
                        {m.display_name || m.username}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date from */}
              <div>
                <label className="block text-[10px] text-sol-text-muted uppercase tracking-wider mb-1">From</label>
                <input
                  type="date"
                  value={filters.date_from ?? ''}
                  onChange={(e) => updateFilter({ date_from: e.target.value || undefined })}
                  className="bg-sol-bg-elevated border border-sol-border rounded-md px-2 py-1 text-xs text-sol-text-primary outline-none focus:border-sol-amber/30"
                />
              </div>

              {/* Date to */}
              <div>
                <label className="block text-[10px] text-sol-text-muted uppercase tracking-wider mb-1">To</label>
                <input
                  type="date"
                  value={filters.date_to ?? ''}
                  onChange={(e) => updateFilter({ date_to: e.target.value || undefined })}
                  className="bg-sol-bg-elevated border border-sol-border rounded-md px-2 py-1 text-xs text-sol-text-primary outline-none focus:border-sol-amber/30"
                />
              </div>

              {/* Checkbox filters */}
              <div className="flex items-end gap-3 pb-0.5">
                <label className="flex items-center gap-1.5 text-xs text-sol-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.has_attachment ?? false}
                    onChange={(e) => updateFilter({ has_attachment: e.target.checked || undefined })}
                    className="accent-sol-amber"
                  />
                  Has file
                </label>
                <label className="flex items-center gap-1.5 text-xs text-sol-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.has_link ?? false}
                    onChange={(e) => updateFilter({ has_link: e.target.checked || undefined })}
                    className="accent-sol-amber"
                  />
                  Has link
                </label>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                onClick={() => setFilters({})}
                className="text-[10px] text-sol-text-muted hover:text-sol-amber transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

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
