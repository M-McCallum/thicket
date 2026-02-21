import { useState } from 'react'
import { polls as pollsApi } from '@renderer/services/api'

interface PollCreatorProps {
  channelId: string
  onClose: () => void
  onCreated: () => void
}

export default function PollCreator({ channelId, onClose, onCreated }: PollCreatorProps) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState([
    { text: '', emoji: '' },
    { text: '', emoji: '' }
  ])
  const [multiSelect, setMultiSelect] = useState(false)
  const [anonymous, setAnonymous] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, { text: '', emoji: '' }])
    }
  }

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index))
    }
  }

  const updateOption = (index: number, text: string) => {
    const newOptions = [...options]
    newOptions[index] = { ...newOptions[index], text }
    setOptions(newOptions)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return

    const validOptions = options.filter((o) => o.text.trim())
    if (validOptions.length < 2) {
      setError('At least 2 options are required')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      await pollsApi.create(channelId, {
        question: question.trim(),
        options: validOptions.map((o) => ({ text: o.text.trim(), emoji: o.emoji })),
        multi_select: multiSelect,
        anonymous
      })
      onCreated()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-lg p-4 mx-4 mb-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sol-text-primary">Create Poll</h3>
        <button
          onClick={onClose}
          className="text-sol-text-secondary hover:text-sol-text-primary text-lg leading-none"
        >
          x
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder="Ask a question..."
            className="w-full px-3 py-2 rounded bg-sol-bg-primary border border-sol-bg-elevated text-sol-text-primary placeholder-sol-text-secondary/50 focus:outline-none focus:border-sol-accent"
          />
        </div>

        <div className="space-y-2">
          {options.map((option, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={option.text}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 px-3 py-1.5 rounded bg-sol-bg-primary border border-sol-bg-elevated text-sol-text-primary placeholder-sol-text-secondary/50 focus:outline-none focus:border-sol-accent text-sm"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-sol-text-secondary hover:text-red-400 text-sm px-1"
                >
                  x
                </button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <button
              type="button"
              onClick={addOption}
              className="text-sm text-sol-accent hover:text-sol-accent/80"
            >
              + Add Option
            </button>
          )}
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-sol-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={multiSelect}
              onChange={(e) => setMultiSelect(e.target.checked)}
              className="rounded border-sol-bg-elevated"
            />
            Multiple choice
          </label>
          <label className="flex items-center gap-2 text-sm text-sol-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="rounded border-sol-bg-elevated"
            />
            Anonymous
          </label>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-sol-text-secondary hover:text-sol-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !question.trim()}
            className="px-3 py-1.5 rounded bg-sol-accent text-white text-sm font-medium hover:bg-sol-accent/80 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Poll'}
          </button>
        </div>
      </form>
    </div>
  )
}
