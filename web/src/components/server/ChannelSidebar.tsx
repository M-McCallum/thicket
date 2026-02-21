import { useState, lazy, Suspense } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useAuthStore } from '@/stores/authStore'
import { useHasPermission } from '@/stores/permissionStore'
import { PermManageServer, PermManageChannels } from '@/types/permissions'
import InviteModal from './InviteModal'
import StickerManager from './StickerManager'
import { invalidateStickerCache } from '@/components/chat/MessageInput'

const ServerSettingsModal = lazy(() => import('./ServerSettingsModal'))

export default function ChannelSidebar() {
  const { channels, categories, activeChannelId, setActiveChannel, servers, activeServerId, createChannel } = useServerStore()
  const { activeChannelId: voiceChannelId, participants, joinVoiceChannel, speakingUserIds } = useVoiceStore()
  const { user } = useAuthStore()
  const activeServer = servers.find((s) => s.id === activeServerId)
  const isOwner = activeServer?.owner_id === user?.id
  const canManageServer = useHasPermission(PermManageServer)
  const canManageChannels = useHasPermission(PermManageChannels)
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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

  // Group text channels by category
  const uncategorizedChannels = textChannels.filter((c) => !c.category_id)
  const sortedCategories = [...categories].sort((a, b) => a.position - b.position)
  const channelsByCategory = sortedCategories.map((cat) => ({
    category: cat,
    channels: textChannels.filter((c) => c.category_id === cat.id)
  }))

  const handleVoiceChannelClick = (channelId: string) => {
    if (!activeServerId) return
    setActiveChannel(channelId)
    // Only join if not already connected to this voice channel
    if (voiceChannelId !== channelId) {
      joinVoiceChannel(activeServerId, channelId)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-sol-bg-secondary overflow-hidden">
      {/* Server name header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-sol-bg-elevated">
        <h2 className="font-display text-sm font-bold text-sol-text-primary truncate tracking-wide">
          {activeServer?.name ?? 'Server'}
        </h2>
        {canManageServer && (
          <button
            onClick={() => setShowSettings(true)}
            className="text-sol-text-muted hover:text-sol-amber transition-colors"
            title="Server Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Uncategorized text channels */}
        {uncategorizedChannels.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 flex items-center justify-between">
              <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
                Text Channels
              </span>
              {canManageChannels && (
                <button
                  onClick={() => openCreateModal('text')}
                  className="text-sol-text-muted hover:text-sol-amber transition-colors"
                  title="Create Text Channel"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 3v14M3 10h14" />
                  </svg>
                </button>
              )}
            </div>
              {uncategorizedChannels.map((channel) => (
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
        )}

        {/* Categorized text channels */}
        {channelsByCategory.map(({ category, channels: catChannels }) => (
          <div key={category.id} className="mb-2">
            <div className="px-3 py-1 flex items-center justify-between">
              <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
                {category.name}
              </span>
              {canManageChannels && (
                <button
                  onClick={() => openCreateModal('text')}
                  className="text-sol-text-muted hover:text-sol-amber transition-colors"
                  title="Create Channel"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 3v14M3 10h14" />
                  </svg>
                </button>
              )}
            </div>
            {catChannels.map((channel) => (
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
        ))}

        {/* Voice channels */}
        <div>
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-xs font-mono text-sol-text-muted uppercase tracking-wider">
              Voice Channels
            </span>
            {canManageChannels && (
              <button
                onClick={() => openCreateModal('voice')}
                className="text-sol-text-muted hover:text-sol-amber transition-colors"
                title="Create Voice Channel"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 3v14M3 10h14" />
                </svg>
              </button>
            )}
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
                          {p.cameraEnabled && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-sage shrink-0">
                              <path d="M23 7l-7 5 7 5V7z" />
                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                          )}
                          {p.screenShareEnabled && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-sage shrink-0">
                              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                              <line x1="8" y1="21" x2="16" y2="21" />
                              <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                          )}
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

      {/* Server settings modal */}
      {showSettings && activeServer && (
        <Suspense fallback={null}>
          <ServerSettingsModal server={activeServer} onClose={() => setShowSettings(false)} />
        </Suspense>
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
