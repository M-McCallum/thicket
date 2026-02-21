import { useState, useEffect, useRef, useCallback } from 'react'
import type { PublicServer } from '@/types/models'
import { discover, servers as serversApi } from '@/services/api'
import { useServerStore } from '@/stores/serverStore'

const PAGE_SIZE = 20

export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicServer[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offsetRef = useRef(0)
  const setDiscoverOpen = useServerStore((s) => s.setDiscoverOpen)
  const fetchServers = useServerStore((s) => s.fetchServers)
  const myServers = useServerStore((s) => s.servers)

  const searchServers = useCallback(async (q: string, offset: number, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError('')
    try {
      const data = await discover.search(q, PAGE_SIZE, offset)
      if (append) {
        setResults((prev) => [...prev, ...data])
      } else {
        setResults(data)
      }
      setHasMore(data.length === PAGE_SIZE)
      offsetRef.current = offset + data.length
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search servers')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    searchServers('', 0, false)
  }, [searchServers])

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      offsetRef.current = 0
      searchServers(query, 0, false)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, searchServers])

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return
    searchServers(query, offsetRef.current, true)
  }

  const handleJoin = async (serverId: string) => {
    setJoiningId(serverId)
    setError('')
    try {
      await serversApi.join({ invite_code: '', server_id: serverId })
      await fetchServers()
      // Remove from results or mark as joined
      setResults((prev) => prev.filter((s) => s.id !== serverId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join server')
    } finally {
      setJoiningId(null)
    }
  }

  const myServerIds = new Set(myServers.map((s) => s.id))

  return (
    <div className="flex-1 flex flex-col bg-sol-bg min-w-0 overflow-hidden">
      {/* Header */}
      <div className="h-12 flex items-center px-6 border-b border-sol-bg-elevated shrink-0">
        <button
          onClick={() => setDiscoverOpen(false)}
          className="mr-3 text-sol-text-muted hover:text-sol-text-primary transition-colors"
          title="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h2 className="font-display text-sm font-bold text-sol-text-primary tracking-wide">
          Discover Servers
        </h2>
      </div>

      {/* Search */}
      <div className="px-6 py-4 shrink-0">
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sol-text-muted"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search public servers..."
            className="w-full bg-sol-bg-tertiary text-sol-text-primary border border-sol-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-sol-amber/30"
          />
        </div>
      </div>

      {error && (
        <div className="px-6 pb-2">
          <p className="text-sm text-sol-coral">{error}</p>
        </div>
      )}

      {/* Results grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sol-text-muted text-sm">Searching...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted/30 mb-4">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="text-sol-text-muted text-sm">
              {query ? 'No servers found matching your search.' : 'No public servers available.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((server) => {
                const alreadyJoined = myServerIds.has(server.id)
                return (
                  <div
                    key={server.id}
                    className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 flex flex-col hover:border-sol-amber/30 transition-colors"
                  >
                    {/* Server icon + name */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-sol-bg-elevated flex items-center justify-center shrink-0">
                        {server.icon_url ? (
                          <img
                            src={server.icon_url}
                            alt={server.name}
                            className="w-12 h-12 rounded-xl object-cover"
                          />
                        ) : (
                          <span className="font-display text-lg font-bold text-sol-text-muted">
                            {server.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-sol-text-primary truncate">
                          {server.name}
                        </h3>
                        <p className="text-xs text-sol-text-muted">
                          {server.member_count} {server.member_count === 1 ? 'member' : 'members'}
                        </p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-sol-text-secondary flex-1 mb-3 line-clamp-3">
                      {server.description || 'No description'}
                    </p>

                    {/* Join button */}
                    {alreadyJoined ? (
                      <button
                        disabled
                        className="w-full px-3 py-1.5 bg-sol-bg-elevated text-sol-text-muted rounded-lg text-sm cursor-default"
                      >
                        Joined
                      </button>
                    ) : (
                      <button
                        onClick={() => handleJoin(server.id)}
                        disabled={joiningId === server.id}
                        className="w-full px-3 py-1.5 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors text-sm font-medium"
                      >
                        {joiningId === server.id ? 'Joining...' : 'Join Server'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-sol-bg-secondary border border-sol-bg-elevated text-sol-text-secondary rounded-lg hover:text-sol-amber hover:border-sol-amber/30 disabled:opacity-50 transition-colors text-sm"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
