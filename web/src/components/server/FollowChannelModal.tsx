import { useState, useEffect } from 'react'
import { servers as serversApi, channels as channelsApi, channelFollows } from '@/services/api'
import type { Server, Channel, ChannelFollow } from '@/types/models'

interface FollowChannelModalProps {
  sourceChannelId: string
  sourceChannelName: string
  onClose: () => void
}

export default function FollowChannelModal({ sourceChannelId, sourceChannelName, onClose }: FollowChannelModalProps) {
  const [userServers, setUserServers] = useState<Server[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [serverChannels, setServerChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')
  const [existingFollows, setExistingFollows] = useState<ChannelFollow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [svrs, follows] = await Promise.all([
          serversApi.list(),
          channelFollows.list(sourceChannelId)
        ])
        setUserServers(svrs)
        setExistingFollows(follows)
      } catch {
        setError('Failed to load data')
      }
    }
    load()
  }, [sourceChannelId])

  useEffect(() => {
    if (!selectedServerId) {
      setServerChannels([])
      setSelectedChannelId('')
      return
    }
    const loadChannels = async () => {
      try {
        const chs = await channelsApi.list(selectedServerId)
        // Only show text channels that aren't the source
        const textChannels = chs.filter(
          (c) => c.type === 'text' && c.id !== sourceChannelId
        )
        setServerChannels(textChannels)
        setSelectedChannelId('')
      } catch {
        setError('Failed to load channels')
      }
    }
    loadChannels()
  }, [selectedServerId, sourceChannelId])

  const handleFollow = async () => {
    if (!selectedChannelId) return
    setIsLoading(true)
    setError(null)
    try {
      const follow = await channelFollows.follow(sourceChannelId, selectedChannelId)
      setExistingFollows((prev) => [...prev, follow])
      setSelectedChannelId('')
      setSelectedServerId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to follow channel')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnfollow = async (followId: string) => {
    try {
      await channelFollows.unfollow(sourceChannelId, followId)
      setExistingFollows((prev) => prev.filter((f) => f.id !== followId))
    } catch {
      setError('Failed to unfollow')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-[28rem] max-h-[80vh] flex flex-col animate-grow-in"
      >
        <h3 className="font-display text-lg text-sol-amber mb-1">
          Follow #{sourceChannelName}
        </h3>
        <p className="text-xs text-sol-text-muted mb-4">
          New messages from this announcement channel will be cross-posted to the selected channel.
        </p>

        {error && (
          <div className="text-red-400 text-sm mb-3 bg-red-400/10 px-3 py-2 rounded">
            {error}
          </div>
        )}

        {/* Existing follows */}
        {existingFollows.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-mono text-sol-text-muted uppercase tracking-wider mb-2">
              Current Followers
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {existingFollows.map((follow) => (
                <div
                  key={follow.id}
                  className="flex items-center justify-between px-3 py-1.5 bg-sol-bg/50 rounded text-sm"
                >
                  <span className="text-sol-text-secondary truncate">
                    {follow.target_channel_id.slice(0, 8)}...
                  </span>
                  <button
                    onClick={() => handleUnfollow(follow.id)}
                    className="text-sol-text-muted hover:text-red-400 transition-colors text-xs"
                  >
                    Unfollow
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add new follow */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-sol-text-muted mb-1">Server</label>
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="w-full bg-sol-bg border border-sol-bg-elevated rounded-lg px-3 py-2 text-sm text-sol-text-primary focus:outline-none focus:ring-1 focus:ring-sol-amber"
            >
              <option value="">Select a server...</option>
              {userServers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {selectedServerId && (
            <div>
              <label className="block text-xs text-sol-text-muted mb-1">Channel</label>
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="w-full bg-sol-bg border border-sol-bg-elevated rounded-lg px-3 py-2 text-sm text-sol-text-primary focus:outline-none focus:ring-1 focus:ring-sol-amber"
              >
                <option value="">Select a channel...</option>
                {serverChannels.map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="btn-danger">
            Close
          </button>
          <button
            onClick={handleFollow}
            disabled={!selectedChannelId || isLoading}
            className="btn-primary disabled:opacity-50"
          >
            {isLoading ? 'Following...' : 'Follow'}
          </button>
        </div>
      </div>
    </div>
  )
}
