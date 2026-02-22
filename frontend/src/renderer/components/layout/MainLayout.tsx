import { useEffect, useState, useCallback, lazy, Suspense, useRef } from 'react'
import TitleBar from './TitleBar'
import UpdateNotification from './UpdateNotification'
import ServerSidebar from '@renderer/components/server/ServerSidebar'
import ChannelSidebar from '@renderer/components/server/ChannelSidebar'
import ChatArea from '@renderer/components/chat/ChatArea'
import MemberList from '@renderer/components/server/MemberList'
import VoiceControls from '@renderer/components/voice/VoiceControls'
import VideoGrid from '@renderer/components/voice/VideoGrid'
import StageChannelView from '@renderer/components/voice/StageChannelView'
import PiPOverlay from '@renderer/components/voice/PiPOverlay'
import ConversationList from '@renderer/components/dm/ConversationList'
import DMChatArea from '@renderer/components/dm/DMChatArea'
import FriendsList from '@renderer/components/dm/FriendsList'
import FriendRequests from '@renderer/components/dm/FriendRequests'
import ServerInvites from '@renderer/components/dm/ServerInvites'
import AddFriendModal from '@renderer/components/dm/AddFriendModal'
import IncomingCallOverlay from '@renderer/components/dm/IncomingCallOverlay'
import SearchModal from '@renderer/components/search/SearchModal'
import WelcomeScreen from '@renderer/components/server/WelcomeScreen'
import { useServerStore } from '@renderer/stores/serverStore'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useStageStore } from '@renderer/stores/stageStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useLayoutStore } from '@renderer/stores/layoutStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useWebSocketEvents } from '@renderer/hooks/useWebSocketEvents'
import { wsService, type WSConnectionStatus } from '@renderer/services/ws'
import { onboarding as onboardingApi } from '@renderer/services/api'

const DiscoverPage = lazy(() => import('@renderer/components/server/DiscoverPage'))

type DMTab = 'conversations' | 'friends' | 'requests' | 'invites'

export default function MainLayout() {
  const { activeServerId, activeChannelId, channels, fetchServers, servers, setActiveChannel } = useServerStore()
  const isDiscoverOpen = useServerStore((s) => s.isDiscoverOpen)
  const { activeChannelId: voiceChannelId } = useVoiceStore()
  const [dmTab, setDMTab] = useState<DMTab>('conversations')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [checkingOnboarding, setCheckingOnboarding] = useState(false)

  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen)
  const memberListOpen = useLayoutStore((s) => s.memberListOpen)
  const closeAll = useLayoutStore((s) => s.closeAll)

  useWebSocketEvents()

  // Track WebSocket connection status for the disconnection banner
  const [wsStatus, setWsStatus] = useState<WSConnectionStatus>(wsService.status)
  const [showBanner, setShowBanner] = useState(false)
  const disconnectedSince = useRef<number | null>(null)

  useEffect(() => {
    return wsService.onStatusChange((status) => setWsStatus(status))
  }, [])

  // Only show the banner after being disconnected/connecting for >4s to
  // avoid flashing it during brief reconnects
  useEffect(() => {
    if (wsStatus === 'connected') {
      disconnectedSince.current = null
      setShowBanner(false)
      return
    }
    // Start tracking when we first left 'connected'
    if (disconnectedSince.current === null) {
      disconnectedSince.current = Date.now()
    }
    const timer = setTimeout(() => setShowBanner(true), 4000)
    return () => clearTimeout(timer)
  }, [wsStatus])

  useEffect(() => {
    fetchServers()
    useThemeStore.getState().loadPreferences()
    // Request notification permission (web fallback only)
    if (!window.api?.notifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [fetchServers])

  // Listen for notification clicks from main process to navigate
  useEffect(() => {
    if (!window.api?.notifications) return
    return window.api.notifications.onClicked((context) => {
      if (context.type === 'channel') {
        useServerStore.getState().setActiveServer(context.serverId)
        useServerStore.getState().setActiveChannel(context.channelId)
      } else if (context.type === 'dm') {
        useServerStore.getState().setActiveServerNull()
        useDMStore.getState().setActiveConversation(context.conversationId)
      }
    })
  }, [])

  // Check onboarding status when active server changes
  useEffect(() => {
    if (!activeServerId) {
      setShowWelcome(false)
      return
    }

    const server = servers.find((s) => s.id === activeServerId)
    if (!server || (!server.welcome_message && server.welcome_channels.length === 0)) {
      setShowWelcome(false)
      return
    }

    setCheckingOnboarding(true)
    onboardingApi.getStatus(activeServerId)
      .then((status) => {
        if (!status.completed) {
          setShowWelcome(true)
        } else {
          setShowWelcome(false)
        }
      })
      .catch(() => setShowWelcome(false))
      .finally(() => setCheckingOnboarding(false))
  }, [activeServerId, servers])

  const handleDismissWelcome = useCallback(() => {
    setShowWelcome(false)
  }, [])

  const handleWelcomeChannelSelect = useCallback((channelId: string) => {
    setActiveChannel(channelId)
  }, [setActiveChannel])

  const stageInstance = useStageStore((s) => s.instance)

  // Alt+Up/Down to navigate channels
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!e.altKey || !activeServerId) return
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const textChannels = channels.filter((c) => c.type === 'text')
      if (textChannels.length === 0) return
      const currentIdx = textChannels.findIndex((c) => c.id === activeChannelId)
      let nextIdx: number
      if (e.key === 'ArrowUp') {
        nextIdx = currentIdx <= 0 ? textChannels.length - 1 : currentIdx - 1
      } else {
        nextIdx = currentIdx >= textChannels.length - 1 ? 0 : currentIdx + 1
      }
      setActiveChannel(textChannels[nextIdx].id)
    },
    [activeServerId, channels, activeChannelId, setActiveChannel]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Check if the currently selected channel is a voice channel
  const activeChannel = channels.find((c) => c.id === activeChannelId)
  const isViewingVoiceChannel = activeChannel?.type === 'voice' && voiceChannelId === activeChannelId
  const isViewingVoiceChannelWithoutJoining = activeChannel?.type === 'voice'
  const activeServer = activeServerId ? servers.find((s) => s.id === activeServerId) : null

  // Server + Channel sidebar content (reused for desktop & mobile)
  const serverChannelSidebar = (
    <>
      <ServerSidebar />
      {activeServerId ? (
        <div className="w-60 bg-sol-bg-secondary flex flex-col border-r border-sol-bg-elevated">
          <div className="flex-1 overflow-hidden">
            <ChannelSidebar />
          </div>
          <VoiceControls />
        </div>
      ) : !isDiscoverOpen ? (
        <div className="w-72 bg-sol-bg-secondary flex flex-col border-r border-sol-bg-elevated">
          <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated">
            <h2 className="font-display text-sm font-bold text-sol-text-primary tracking-wide">
              Direct Messages
            </h2>
          </div>

          {/* Tab buttons */}
          <div className="flex gap-0.5 p-1.5 border-b border-sol-bg-elevated">
            {(['conversations', 'friends', 'requests', 'invites'] as DMTab[]).map((tab) => {
              const label = tab === 'conversations' ? 'DMs' : tab === 'friends' ? 'Friends' : tab === 'requests' ? 'Requests' : 'Invites'
              return (
                <button
                  key={tab}
                  onClick={() => setDMTab(tab)}
                  className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                    dmTab === tab
                      ? 'bg-sol-amber/15 text-sol-amber'
                      : 'text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-elevated/50'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            {dmTab === 'conversations' && <ConversationList />}
            {dmTab === 'friends' && <FriendsList />}
            {dmTab === 'requests' && <FriendRequests />}
            {dmTab === 'invites' && <ServerInvites />}
          </div>

          {/* Add friend button */}
          <div className="p-3 border-t border-sol-bg-elevated">
            <button
              onClick={() => setShowAddFriend(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sol-text-secondary hover:text-sol-sage bg-sol-bg/50 hover:bg-sol-sage/10 rounded-lg transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Add Friend
            </button>
          </div>
        </div>
      ) : null}
    </>
  )

  return (
    <div className="h-screen w-screen flex flex-col bg-sol-bg overflow-hidden">
      <TitleBar />
      <UpdateNotification />

      {/* Connection lost banner */}
      {showBanner && (
        <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-sol-coral/90 text-white text-xs font-medium">
          {wsStatus === 'connecting' ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Reconnecting — messages may not update in real time
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
              </svg>
              Connection lost — messages may not update in real time
            </>
          )}
        </div>
      )}

      {/* Warm accent line */}
      <div className="h-1 bg-gradient-to-r from-transparent via-sol-amber/50 to-transparent" />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar — always visible on lg */}
        <div className="hidden lg:flex">
          {serverChannelSidebar}
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div className="flex max-w-[85vw]">
              {serverChannelSidebar}
            </div>
            <div className="flex-1 bg-black/50" onClick={closeAll} />
          </div>
        )}

        {/* Main content area */}
        {activeServerId ? (
          <>
            {showWelcome && activeServer && !checkingOnboarding ? (
              <WelcomeScreen
                server={activeServer}
                channels={channels}
                onDismiss={handleDismissWelcome}
                onChannelSelect={handleWelcomeChannelSelect}
              />
            ) : isViewingVoiceChannelWithoutJoining && activeChannelId ? (
              <div className="flex-1 flex flex-col min-w-0">
                {stageInstance && stageInstance.channel_id === activeChannelId ? (
                  <StageChannelView channelId={activeChannelId} />
                ) : isViewingVoiceChannel ? (
                  <VideoGrid />
                ) : (
                  <StageChannelView channelId={activeChannelId} />
                )}
              </div>
            ) : (
              <ChatArea />
            )}
            {/* Desktop member list */}
            {!showWelcome && (
              <div className="hidden lg:block">
                <MemberList />
              </div>
            )}
            {/* Mobile member list overlay */}
            {memberListOpen && !showWelcome && (
              <div className="fixed inset-0 z-40 lg:hidden flex justify-end">
                <div className="flex-1 bg-black/50" onClick={closeAll} />
                <div className="max-w-[80vw]">
                  <MemberList />
                </div>
              </div>
            )}
          </>
        ) : isDiscoverOpen ? (
          <Suspense fallback={<div className="flex-1 bg-sol-bg" />}>
            <DiscoverPage />
          </Suspense>
        ) : (
          <>
            {/* DM chat area */}
            <DMChatArea />
          </>
        )}
      </div>

      {/* Incoming call overlay */}
      <IncomingCallOverlay />

      {/* Picture-in-Picture overlay */}
      <PiPOverlay />

      {/* Search modal */}
      <SearchModal />

      {/* Add friend modal */}
      {showAddFriend && <AddFriendModal onClose={() => setShowAddFriend(false)} />}

    </div>
  )
}
