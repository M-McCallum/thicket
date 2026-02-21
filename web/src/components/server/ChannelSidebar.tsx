import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useAuthStore } from '@/stores/authStore'
import { useHasPermission } from '@/stores/permissionStore'
import { PermManageServer, PermManageChannels } from '@/types/permissions'
import { useNotificationStore } from '@/stores/notificationStore'
import InviteModal from './InviteModal'
import StickerManager from './StickerManager'
import ChannelSettingsModal from './ChannelSettingsModal'
import { invalidateStickerCache } from '@/components/chat/MessageInput'

const ServerSettingsModal = lazy(() => import('./ServerSettingsModal'))
const EventsPanel = lazy(() => import('./EventsPanel'))

export default function ChannelSidebar() {
  const { channels, categories, activeChannelId, setActiveChannel, servers, activeServerId, createChannel } = useServerStore()
  const { activeChannelId: voiceChannelId, participants, joinVoiceChannel, speakingUserIds } = useVoiceStore()
  const { user } = useAuthStore()
  const activeServer = servers.find((s) => s.id === activeServerId)
  const channelUnread = useNotificationStore((s) => s.channelUnread)
  const isOwner = activeServer?.owner_id === user?.id
  const canManageServer = useHasPermission(PermManageServer)
  const canManageChannels = useHasPermission(PermManageChannels)
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [createType, setCreateType] = useState<'text' | 'voice' | 'forum'>('text')
  const [newChannelName, setNewChannelName] = useState('')
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channelId: string } | null>(null)
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const prefs = useNotificationStore((s) => s.prefs)
  const setPref = useNotificationStore((s) => s.setPref)

  // Category collapse state persisted in localStorage
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('collapsed_categories')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      localStorage.setItem('collapsed_categories', JSON.stringify([...next]))
      return next
    })
  }, [])

  const isCategoryCollapsed = useCallback((categoryId: string) => collapsedCategories.has(categoryId), [collapsedCategories])

  const categoryHasUnread = useCallback((catChannels: typeof channels) => {
    return catChannels.some((ch) => {
      const unread = channelUnread[ch.id]
      return unread && unread.count > 0
    })
  }, [channelUnread])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  const handleChannelContextMenu = (e: React.MouseEvent, channelId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, channelId })
  }

  const getChannelNotifSetting = (channelId: string) => {
    const pref = prefs.find((p) => p.scope_type === 'channel' && p.scope_id === channelId)
    return pref?.setting ?? 'all'
  }

  const openCreateModal = (type: 'text' | 'voice' | 'forum') => {
    setCreateType(type)
    setShowCreate(true)
  }

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannelName.trim()) return
    await createChannel(newChannelName.trim(), createType, createType === 'text' ? isAnnouncement : false)
    setNewChannelName('')
    setIsAnnouncement(false)
    setShowCreate(false)
  }

  const textChannels = channels.filter((c) => c.type === 'text' || c.type === 'forum')
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
    <nav role="navigation" aria-label="Channels" className="flex-1 flex flex-col bg-sol-bg-secondary overflow-hidden">
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
              {uncategorizedChannels.map((channel) => {
                const unread = channelUnread[channel.id]
                return (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannel(channel.id)}
                    onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
                    className={`w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors rounded-lg mx-0
                      ${
                        activeChannelId === channel.id
                          ? 'text-sol-amber bg-sol-amber/10'
                          : unread
                            ? 'text-sol-text-primary font-semibold hover:bg-sol-bg-elevated/50'
                            : 'text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-elevated/50'
                      }`}
                  >
                    {channel.type === 'forum' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted shrink-0">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                    ) : channel.is_announcement ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted shrink-0">
                        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 01-3.46 0" />
                        <line x1="12" y1="2" x2="12" y2="4" />
                      </svg>
                    ) : (
                      <span className="text-sol-text-muted">#</span>
                    )}
                    <span className="text-sm truncate flex-1">{channel.name}</span>
                    {unread && unread.count > 0 && (
                      <span className={`text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 ${
                        unread.mentionCount > 0 ? 'bg-red-500 text-white' : 'bg-sol-text-muted/30 text-sol-text-primary'
                      }`}>
                        {unread.mentionCount > 0 ? unread.mentionCount : unread.count}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        )}

        {/* Categorized text channels */}
        {channelsByCategory.map(({ category, channels: catChannels }) => {
          const collapsed = isCategoryCollapsed(category.id)
          const hasUnread = categoryHasUnread(catChannels)
          return (
            <div key={category.id} className="mb-2">
              <div className="px-3 py-1 flex items-center justify-between">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="flex items-center gap-1 text-xs font-mono text-sol-text-muted uppercase tracking-wider hover:text-sol-text-secondary transition-colors"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {category.name}
                  {collapsed && hasUnread && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sol-text-primary ml-1" />
                  )}
                </button>
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
              {!collapsed && catChannels.map((channel) => {
                const unread = channelUnread[channel.id]
                return (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannel(channel.id)}
                    onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
                    className={`w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors rounded-lg mx-0
                      ${
                        activeChannelId === channel.id
                          ? 'text-sol-amber bg-sol-amber/10'
                          : unread
                            ? 'text-sol-text-primary font-semibold hover:bg-sol-bg-elevated/50'
                            : 'text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-elevated/50'
                      }`}
                  >
                    {channel.type === 'forum' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted shrink-0">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                    ) : channel.is_announcement ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted shrink-0">
                        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 01-3.46 0" />
                        <line x1="12" y1="2" x2="12" y2="4" />
                      </svg>
                    ) : (
                      <span className="text-sol-text-muted">#</span>
                    )}
                    <span className="text-sm truncate flex-1">{channel.name}</span>
                    {unread && unread.count > 0 && (
                      <span className={`text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 ${
                        unread.mentionCount > 0 ? 'bg-red-500 text-white' : 'bg-sol-text-muted/30 text-sol-text-primary'
                      }`}>
                        {unread.mentionCount > 0 ? unread.mentionCount : unread.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}

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
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{channel.name}</span>
                    {channel.voice_status && (
                      <span className="text-[10px] text-sol-text-muted truncate">
                        {channel.voice_status}
                      </span>
                    )}
                  </div>
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
          {canManageChannels && (
            <button
              onClick={() => openCreateModal('forum')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sol-text-secondary hover:text-sol-sage bg-sol-bg/50 hover:bg-sol-sage/10 rounded-lg transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              Create Forum
            </button>
          )}
          <button
            onClick={() => setShowEvents(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sol-text-secondary hover:text-sol-sage bg-sol-bg/50 hover:bg-sol-sage/10 rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Events
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
        <InviteModal serverId={activeServerId!} onClose={() => setShowInvite(false)} />
      )}

      {/* Events panel */}
      {showEvents && activeServerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEvents(false)}>
          <div className="bg-sol-bg-secondary rounded-lg shadow-lg w-full max-w-lg h-[600px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <Suspense fallback={null}>
              <EventsPanel />
            </Suspense>
          </div>
        </div>
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

      {/* Channel notification context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-sol-bg-elevated border border-sol-border rounded-lg shadow-lg py-1 w-48"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {canManageChannels && (
            <>
              <button
                onClick={() => {
                  setChannelSettingsId(contextMenu.channelId)
                  setContextMenu(null)
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-sol-text-secondary hover:bg-sol-bg-secondary hover:text-sol-text-primary transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                Channel Settings
              </button>
              <div className="border-t border-sol-bg-secondary my-1" />
            </>
          )}
          <div className="px-3 py-1.5 text-xs text-sol-text-muted font-mono uppercase tracking-wider">
            Notifications
          </div>
          {(['all', 'mentions', 'none'] as const).map((setting) => {
            const current = getChannelNotifSetting(contextMenu.channelId)
            return (
              <button
                key={setting}
                onClick={() => {
                  setPref('channel', contextMenu.channelId, setting)
                  setContextMenu(null)
                }}
                className={`w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center justify-between ${
                  current === setting
                    ? 'text-sol-amber bg-sol-amber/10'
                    : 'text-sol-text-secondary hover:bg-sol-bg-secondary hover:text-sol-text-primary'
                }`}
              >
                <span className="capitalize">{setting}</span>
                {current === setting && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Channel settings modal */}
      {channelSettingsId && activeServerId && (
        <ChannelSettingsModal
          serverId={activeServerId}
          channelId={channelSettingsId}
          onClose={() => setChannelSettingsId(null)}
        />
      )}

      {/* Create channel modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <form
            onSubmit={handleCreateChannel}
            onClick={(e) => e.stopPropagation()}
            className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
            role="dialog"
            aria-modal="true"
            aria-label="Create channel"
          >
            <h3 className="font-display text-lg text-sol-amber mb-4">
              Create {createType === 'text' ? 'Text' : createType === 'voice' ? 'Voice' : 'Forum'} Channel
            </h3>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className="input-field mb-4"
              placeholder="Channel name"
              aria-label="Channel name"
              autoFocus
              required
            />
            {createType === 'text' && (
              <label className="flex items-center gap-2 mb-4 text-sm text-sol-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnnouncement}
                  onChange={(e) => setIsAnnouncement(e.target.checked)}
                  className="rounded border-sol-bg-elevated"
                />
                Announcement channel
              </label>
            )}
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
    </nav>
  )
}
