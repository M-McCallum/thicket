import { useEffect } from 'react'
import ServerSidebar from '@/components/server/ServerSidebar'
import ChannelSidebar from '@/components/server/ChannelSidebar'
import ChatArea from '@/components/chat/ChatArea'
import MemberList from '@/components/server/MemberList'
import VoiceControls from '@/components/voice/VoiceControls'
import { useServerStore } from '@/stores/serverStore'
import { useWebSocketEvents } from '@/hooks/useWebSocketEvents'

export default function MainLayout() {
  const { activeServerId, fetchServers } = useServerStore()

  useWebSocketEvents()

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

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
            <ChatArea />
            <MemberList />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="font-display text-2xl text-sol-amber mb-2">Find Your Grove</h2>
              <p className="text-sol-text-secondary font-mono text-sm">
                Join a community or start something new
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
