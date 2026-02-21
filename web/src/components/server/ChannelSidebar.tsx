import { useState } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useVoiceStore } from '@/stores/voiceStore'
import InviteModal from './InviteModal'
import StickerManager from './StickerManager'
import { invalidateStickerCache } from '@/components/chat/MessageInput'

export default function ChannelSidebar() {
  const { channels, activeChannelId, setActiveChannel, servers, activeServerId, createChannel } = useServerStore()
  const { activeChannelId: voiceChannelId, participants, joinVoiceChannel, speakingUserIds } = useVoiceStore()
  const activeServer = servers.find((s) => s.id === activeServerId)
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [createType, setCreateType] = useState<'text' | 'voice'>('text')
  const [newChannelName, setNewChannelName] = useState('')

  const openCreateModal = (type: 'text' | 'voice') => {
    setCreateType(type)
    setShowCreate(true)
  }

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannelName.trim()) return
    await createChannel(newChannelName.trim(), createType)
    setNewChannelName('')
    setShowCreate(false)
  }

  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  const handleVoiceChannelClick = (channelId: string) => {
    if (!activeServerId) return
    joinVoiceChannel(activeServerId, channelId)
  }

  return (
    <div className="flex-1 flex flex-col bg-sol-bg-secondary overflow-hidden">
      {/* Server name header */}
      <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated">
        <h2 className="font-display text-sm font-bold text-sol-text-primary truncate tracking-wide">
          {activeServer?.name ?? 'Server'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Text channels */}
        <div className="mb-2">
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Text Channels
            </span>
            <button
              onClick={() => openCreateModal('text')}
              className="text-sol-text-muted hover:text-sol-amber transition-colors"
              title="Create Text Channel"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 3v14M3 10h14" />
              </svg>
            </button>
          </div>
            {textChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={`w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors rounded-lg mx-0
                  ${
                    activeChannelId === channel.id
                      ? 'text-sol-amber bg-sol-amber/10'
                      : 'text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-elevated/50'
                  }`}
              >
                <span className="text-sol-text-muted">#</span>
                <span className="text-sm truncate">{channel.name}</span>
              </button>
            ))}
        </div>

        {/* Voice channels */}
        <div>
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Voice Channels
            </span>
            <button
              onClick={() => openCreateModal('voice')}
              className="text-sol-text-muted hover:text-sol-amber transition-colors"
              title="Create Voice Channel"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 3v14M3 10h14" />
              </svg>
            </button>
          </div>
            {voiceChannels.map((channel) => (
              <div key={channel.id}>
                <button
                  onClick={() => handleVoiceChannelClick(channel.id)}
                  className={`w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors
                    ${
                      voiceChannelId === channel.id
                        ? 'text-sol-amber bg-sol-amber/10'
                        : 'text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-elevated/50'
                    }`}
                >
                  <span className={voiceChannelId === channel.id ? 'text-sol-amber' : 'text-sol-sage/50'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-1 14.93A7.004 7.004 0 015 9h2a5 5 0 0010 0h2a7.004 7.004 0 01-6 6.93V20h4v2H8v-2h4v-4.07z" />
                    </svg>
                  </span>
                  <span className="text-sm truncate">{channel.name}</span>
                </button>
                {/* Show connected participants */}
                {voiceChannelId === channel.id && participants.length > 0 && (
                  <div className="ml-8 py-1">
                    {participants.map((p) => {
                      const isSpeaking = speakingUserIds.includes(p.userId)
                      return (
                        <div
                          key={p.userId}
                          className="flex items-center gap-2 px-2 py-0.5 text-xs text-sol-text-secondary"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isSpeaking
                                ? 'bg-sol-sage ring-2 ring-sol-sage/40 animate-pulse'
                                : 'bg-sol-sage'
                            }`}
                          />
                          <span className={`truncate ${isSpeaking ? 'text-sol-text-primary' : ''}`}>
                            {p.username}
                          </span>
                          {p.muted && <span className="text-sol-text-muted text-[10px]">M</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Bottom actions */}
      {activeServer && (
        <div className="p-3 border-t border-sol-bg-elevated flex flex-col gap-1.5">
          <button
            onClick={() => setShowInvite(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sol-text-secondary hover:text-sol-amber bg-sol-bg/50 hover:bg-sol-amber/10 rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            Invite People
          </button>
          <button
            onClick={() => setShowStickers(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sol-text-secondary hover:text-sol-violet bg-sol-bg/50 hover:bg-sol-violet/10 rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 1010 10h-10V2z" />
              <path d="M12 2v10h10" />
            </svg>
            Sticker Packs
          </button>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && activeServer && (
        <InviteModal inviteCode={activeServer.invite_code} onClose={() => setShowInvite(false)} />
      )}

      {/* Sticker manager */}
      {showStickers && activeServerId && (
        <StickerManager serverId={activeServerId} onClose={() => { setShowStickers(false); invalidateStickerCache() }} />
      )}

      {/* Create channel modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <form
            onSubmit={handleCreateChannel}
            onClick={(e) => e.stopPropagation()}
            className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
          >
            <h3 className="font-display text-lg text-sol-amber mb-4">
              Create {createType === 'text' ? 'Text' : 'Voice'} Channel
            </h3>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className="input-field mb-4"
              placeholder="Channel name"
              autoFocus
              required
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-danger">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
