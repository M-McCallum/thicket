import { useEffect, useState, lazy, Suspense } from 'react'
import ServerSidebar from '@/components/server/ServerSidebar'
import ChannelSidebar from '@/components/server/ChannelSidebar'
import ChatArea from '@/components/chat/ChatArea'
import MemberList from '@/components/server/MemberList'
import VoiceControls from '@/components/voice/VoiceControls'
import VideoGrid from '@/components/voice/VideoGrid'
import PiPOverlay from '@/components/voice/PiPOverlay'
import ConversationList from '@/components/dm/ConversationList'
import DMChatArea from '@/components/dm/DMChatArea'
import FriendsList from '@/components/dm/FriendsList'
import FriendRequests from '@/components/dm/FriendRequests'
import AddFriendModal from '@/components/dm/AddFriendModal'
import IncomingCallOverlay from '@/components/dm/IncomingCallOverlay'
import SearchModal from '@/components/search/SearchModal'
import { useServerStore } from '@/stores/serverStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useThemeStore } from '@/stores/themeStore'
import { useWebSocketEvents } from '@/hooks/useWebSocketEvents'

const DiscoverPage = lazy(() => import('@/components/server/DiscoverPage'))

type DMTab = 'conversations' | 'friends' | 'requests'

export default function MainLayout() {
  const { activeServerId, activeChannelId, channels, fetchServers } = useServerStore()
  const isDiscoverOpen = useServerStore((s) => s.isDiscoverOpen)
  const { activeChannelId: voiceChannelId } = useVoiceStore()
  const [dmTab, setDMTab] = useState<DMTab>('conversations')
  const [showAddFriend, setShowAddFriend] = useState(false)

  useWebSocketEvents()

  useEffect(() => {
    fetchServers()
    useThemeStore.getState().loadPreferences()
    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [fetchServers])

  // Check if the currently selected channel is a voice channel
  const activeChannel = channels.find((c) => c.id === activeChannelId)
  const isViewingVoiceChannel = activeChannel?.type === 'voice' && voiceChannelId === activeChannelId

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
            {isViewingVoiceChannel ? (
              <div className="flex-1 flex flex-col min-w-0">
                <VideoGrid />
              </div>
            ) : (
              <ChatArea />
            )}
            <MemberList />
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
    </div>
  )
}
