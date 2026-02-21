import { useEffect, useState, useCallback } from 'react'
import type { ForumTag, ForumPost } from '@/types/models'
import { forum as forumApi } from '@/services/api'
import ForumPostCard from './ForumPostCard'
import CreateForumPostModal from './CreateForumPostModal'
import ForumPostView from './ForumPostView'

type SortOption = 'latest' | 'newest' | 'top'

const SORT_LABELS: Record<SortOption, string> = {
  latest: 'Latest Activity',
  newest: 'Newest',
  top: 'Most Replies'
}

interface ForumChannelViewProps {
  channelId: string
  channelName: string
}

export default function ForumChannelView({ channelId, channelName }: ForumChannelViewProps) {
  const [tags, setTags] = useState<ForumTag[]>([])
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('latest')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [fetchedTags, fetchedPosts] = await Promise.all([
        forumApi.getTags(channelId),
        forumApi.getPosts(channelId, sortBy, selectedTagIds.length > 0 ? selectedTagIds : undefined)
      ])
      setTags(fetchedTags)
      setPosts(fetchedPosts)
    } catch {
      // error ignored
    } finally {
      setLoading(false)
    }
  }, [channelId, sortBy, selectedTagIds])

  useEffect(() => {
    setActivePostId(null)
    setSelectedTagIds([])
    setSearchQuery('')
    setSortBy('latest')
  }, [channelId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleCreatePost = async (title: string, content: string, tagIds: string[]) => {
    const newPost = await forumApi.createPost(channelId, { title, content, tag_ids: tagIds })
    setPosts((prev) => [newPost, ...prev])
    setShowCreateModal(false)
  }

  // If viewing a specific post, show the post view
  if (activePostId) {
    return (
      <ForumPostView
        postId={activePostId}
        onBack={() => setActivePostId(null)}
      />
    )
  }

  // Filter by search query
  const filteredPosts = searchQuery
    ? posts.filter((p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content_preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : posts

  return (
    <div className="flex-1 flex flex-col bg-sol-bg-tertiary">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated justify-between">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <h3 className="font-medium text-sol-text-primary">{channelName}</h3>
          <span className="text-xs text-sol-text-muted font-mono ml-1">Forum</span>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary text-xs px-3 py-1.5"
        >
          New Post
        </button>
      </div>

      {/* Toolbar: search, sort, view toggle */}
      <div className="px-4 py-3 border-b border-sol-bg-elevated flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sol-text-muted">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts..."
            className="input-field pl-8 py-1.5 text-sm w-full"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 bg-sol-bg-secondary rounded-lg p-0.5">
          {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors ${
                sortBy === opt
                  ? 'bg-sol-bg-elevated text-sol-amber'
                  : 'text-sol-text-muted hover:text-sol-text-primary'
              }`}
            >
              {SORT_LABELS[opt]}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-sol-bg-secondary rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-sol-bg-elevated text-sol-amber' : 'text-sol-text-muted hover:text-sol-text-primary'}`}
            title="Grid view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-sol-bg-elevated text-sol-amber' : 'text-sol-text-muted hover:text-sol-text-primary'}`}
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tag filter bar */}
      {tags.length > 0 && (
        <div className="px-4 py-2 border-b border-sol-bg-elevated flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-sol-text-muted uppercase tracking-wider mr-1">Tags:</span>
          {tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                onClick={() => toggleTagFilter(tag.id)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono transition-all"
                style={{
                  backgroundColor: isSelected
                    ? (tag.color ? `${tag.color}30` : 'rgb(var(--sol-amber) / 0.2)')
                    : 'rgb(var(--sol-bg-elevated))',
                  color: isSelected
                    ? (tag.color || 'rgb(var(--sol-amber))')
                    : 'rgb(var(--sol-text-secondary))',
                  border: `1px solid ${isSelected
                    ? (tag.color ? `${tag.color}60` : 'rgb(var(--sol-amber) / 0.4)')
                    : 'transparent'
                  }`
                }}
              >
                {tag.emoji && <span>{tag.emoji}</span>}
                {tag.name}
              </button>
            )
          })}
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="text-[10px] text-sol-text-muted hover:text-sol-text-primary ml-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Posts */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8 text-sol-text-muted text-sm">Loading posts...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 text-sol-text-muted/30">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="text-sol-text-muted text-sm">
              {searchQuery ? 'No posts match your search' : 'No posts yet. Start the discussion!'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary text-xs mt-3"
              >
                Create First Post
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredPosts.map((post) => (
              <ForumPostCard
                key={post.id}
                post={post}
                onClick={() => setActivePostId(post.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredPosts.map((post) => (
              <ForumPostCard
                key={post.id}
                post={post}
                onClick={() => setActivePostId(post.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create post modal */}
      {showCreateModal && (
        <CreateForumPostModal
          tags={tags}
          onSubmit={handleCreatePost}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}
