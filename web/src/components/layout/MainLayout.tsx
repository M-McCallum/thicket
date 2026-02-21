import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import ServerSidebar from '@/components/server/ServerSidebar'
import ChannelSidebar from '@/components/server/ChannelSidebar'
import ChatArea from '@/components/chat/ChatArea'
import MemberList from '@/components/server/MemberList'
import VoiceControls from '@/components/voice/VoiceControls'
import VideoGrid from '@/components/voice/VideoGrid'
import StageChannelView from '@/components/voice/StageChannelView'
import PiPOverlay from '@/components/voice/PiPOverlay'
import ConversationList from '@/components/dm/ConversationList'
import DMChatArea from '@/components/dm/DMChatArea'
import FriendsList from '@/components/dm/FriendsList'
import FriendRequests from '@/components/dm/FriendRequests'
import AddFriendModal from '@/components/dm/AddFriendModal'
import IncomingCallOverlay from '@/components/dm/IncomingCallOverlay'
import SettingsOverlay from '@/components/settings/SettingsOverlay'
import SearchModal from '@/components/search/SearchModal'
import WelcomeScreen from '@/components/server/WelcomeScreen'
import { useServerStore } from '@/stores/serverStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useStageStore } from '@/stores/stageStore'
import { useThemeStore } from '@/stores/themeStore'
import { useWebSocketEvents } from '@/hooks/useWebSocketEvents'
import { onboarding as onboardingApi } from '@/services/api'

const DiscoverPage = lazy(() => import('@/components/server/DiscoverPage'))

type DMTab = 'conversations' | 'friends' | 'requests'

export default function MainLayout() {
  const { activeServerId, activeChannelId, channels, fetchServers, servers, setActiveChannel } = useServerStore()
  const isDiscoverOpen = useServerStore((s) => s.isDiscoverOpen)
  const { activeChannelId: voiceChannelId } = useVoiceStore()
  const [dmTab, setDMTab] = useState<DMTab>('conversations')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [checkingOnboarding, setCheckingOnboarding] = useState(false)

  useWebSocketEvents()

  useEffect(() => {
    fetchServers()
    useThemeStore.getState().loadPreferences()
    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [fetchServers])

  // Check onboarding status when active server changes
  useEffect(() => {
    if (!activeServerId) {
      setShowWelcome(false)
      return
    }

    const server = servers.find((s) => s.id === activeServerId)
    // Only show welcome if the server has a welcome message or welcome channels
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

  return (
    <div className="h-screen w-screen flex flex-col bg-sol-bg overflow-hidden">
      {/* Warm accent line */}
      <div className="h-1 bg-gradient-to-r from-transparent via-sol-amber/50 to-transparent" />

      <div className="flex flex-1 overflow-hidden">
        <ServerSidebar />
        {activeServerId ? (
          <>
            <div className="w-60 bg-sol-bg-secondary flex flex-col border-r border-sol-bg-elevated">
              <div className="flex-1 overflow-hidden">
                <ChannelSidebar />
              </div>
              <VoiceControls />
            </div>
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
            {!showWelcome && <MemberList />}
          </>
        ) : isDiscoverOpen ? (
          <Suspense fallback={<div className="flex-1 bg-sol-bg" />}>
            <DiscoverPage />
          </Suspense>
        ) : (
          <>
            {/* DM sidebar */}
            <div className="w-60 bg-sol-bg-secondary flex flex-col border-r border-sol-bg-elevated">
              <div className="h-12 flex items-center px-4 border-b border-sol-bg-elevated">
                <h2 className="font-display text-sm font-bold text-sol-text-primary tracking-wide">
                  Direct Messages
                </h2>
              </div>

              {/* Tab buttons */}
              <div className="flex border-b border-sol-bg-elevated">
                {(['conversations', 'friends', 'requests'] as DMTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDMTab(tab)}
                    className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                      dmTab === tab
                        ? 'text-sol-amber border-b-2 border-sol-amber'
                        : 'text-sol-text-muted hover:text-sol-text-primary'
                    }`}
                  >
                    {tab === 'conversations' ? 'DMs' : tab === 'friends' ? 'Friends' : 'Requests'}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {dmTab === 'conversations' && <ConversationList />}
                {dmTab === 'friends' && <FriendsList />}
                {dmTab === 'requests' && <FriendRequests />}
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

      {/* Settings overlay */}
      {showSettings && <SettingsOverlay onClose={() => setShowSettings(false)} />}

      {/* Settings button (fixed bottom-right) */}
      <button
        onClick={() => setShowSettings(true)}
        className="fixed bottom-4 right-4 w-10 h-10 rounded-full bg-sol-bg-secondary border border-sol-bg-elevated flex items-center justify-center text-sol-text-muted hover:text-sol-amber hover:border-sol-amber/30 transition-colors z-40"
        title="Accessibility Settings"
        aria-label="Open accessibility settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>
    </div>
  )
}
