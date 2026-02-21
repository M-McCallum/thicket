import { useState } from 'react'
import type { ForumTag } from '@/types/models'

interface CreateForumPostModalProps {
  tags: ForumTag[]
  onSubmit: (title: string, content: string, tagIds: string[]) => Promise<void>
  onClose: () => void
}

export default function CreateForumPostModal({ tags, onSubmit, onClose }: CreateForumPostModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(title.trim(), content.trim(), selectedTagIds)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-[32rem] max-h-[80vh] overflow-y-auto animate-grow-in"
      >
        <h3 className="font-display text-lg text-sol-amber mb-4">New Forum Post</h3>

        {/* Title */}
        <label className="block text-xs font-mono text-sol-text-muted uppercase tracking-wider mb-1">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-field mb-4"
          placeholder="Post title"
          autoFocus
          required
          maxLength={200}
        />

        {/* Tags */}
        {tags.length > 0 && (
          <>
            <label className="block text-xs font-mono text-sol-text-muted uppercase tracking-wider mb-1">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono transition-all"
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
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Content */}
        <label className="block text-xs font-mono text-sol-text-muted uppercase tracking-wider mb-1">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="input-field mb-4 min-h-[120px] resize-y"
          placeholder="Write the opening message for your post..."
          required
        />

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-sol-bg-elevated hover:bg-sol-bg text-sol-text-secondary hover:text-sol-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !content.trim() || submitting}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Post'}
          </button>
        </div>
      </form>
    </div>
  )
}
