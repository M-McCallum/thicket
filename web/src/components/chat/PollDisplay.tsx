import { useState, useEffect } from 'react'
import type { PollWithOptions } from '@/types/models'
import { polls as pollsApi } from '@/services/api'

interface PollDisplayProps {
  messageId: string
  initialPoll?: PollWithOptions | null
}

export default function PollDisplay({ messageId, initialPoll }: PollDisplayProps) {
  const [poll, setPoll] = useState<PollWithOptions | null>(initialPoll || null)
  const [isLoading, setIsLoading] = useState(!initialPoll)
  const [isVoting, setIsVoting] = useState(false)

  useEffect(() => {
    if (!initialPoll && messageId) {
      // Fetch poll by looking up from message_id. Since we don't have a direct
      // API for this, we'll rely on the poll data being embedded in the message.
      setIsLoading(false)
    }
  }, [messageId, initialPoll])

  useEffect(() => {
    if (initialPoll) {
      setPoll(initialPoll)
    }
  }, [initialPoll])

  const handleVote = async (optionId: string) => {
    if (!poll || isVoting) return
    setIsVoting(true)
    try {
      // If already voted for this option, remove vote
      const option = poll.options.find((o) => o.id === optionId)
      if (option?.voted) {
        await pollsApi.removeVote(poll.id, optionId)
      } else {
        await pollsApi.vote(poll.id, optionId)
      }

      // Refetch poll to get updated counts
      const updated = await pollsApi.get(poll.id)
      setPoll(updated)
    } catch {
      // ignore
    } finally {
      setIsVoting(false)
    }
  }

  if (isLoading) {
    return <div className="text-sm text-sol-text-secondary py-2">Loading poll...</div>
  }

  if (!poll) return null

  const hasVoted = poll.options.some((o) => o.voted)
  const isExpired = poll.expires_at ? new Date(poll.expires_at) < new Date() : false
  const maxVotes = Math.max(...poll.options.map((o) => o.vote_count), 1)

  return (
    <div className="bg-sol-bg-secondary rounded-lg p-3 mt-2 max-w-md border border-sol-bg-elevated">
      <h4 className="font-semibold text-sol-text-primary mb-3">{poll.question}</h4>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const percentage = poll.total_votes > 0
            ? Math.round((option.vote_count / poll.total_votes) * 100)
            : 0
          const barWidth = maxVotes > 0
            ? Math.round((option.vote_count / maxVotes) * 100)
            : 0

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={isVoting || isExpired}
              className={`w-full text-left relative overflow-hidden rounded p-2 transition-colors ${
                option.voted
                  ? 'border border-sol-accent/40'
                  : 'border border-sol-bg-elevated hover:border-sol-accent/20'
              } disabled:cursor-not-allowed`}
            >
              {/* Background bar */}
              {hasVoted && (
                <div
                  className={`absolute inset-y-0 left-0 ${
                    option.voted ? 'bg-sol-accent/20' : 'bg-sol-bg-elevated/60'
                  } transition-all duration-300`}
                  style={{ width: `${barWidth}%` }}
                />
              )}

              <div className="relative flex items-center justify-between">
                <span className="text-sm text-sol-text-primary flex items-center gap-2">
                  {option.emoji && <span>{option.emoji}</span>}
                  {option.text}
                  {option.voted && (
                    <span className="text-sol-accent text-xs font-medium">&#10003;</span>
                  )}
                </span>
                {hasVoted && (
                  <span className="text-xs text-sol-text-secondary ml-2">
                    {option.vote_count} ({percentage}%)
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-sol-text-secondary">
        <span>{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          {poll.multi_select && <span>Multiple choice</span>}
          {poll.anonymous && <span>Anonymous</span>}
          {isExpired && <span className="text-red-400">Expired</span>}
        </div>
      </div>
    </div>
  )
}
