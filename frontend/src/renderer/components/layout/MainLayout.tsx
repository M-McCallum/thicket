import { useEffect } from 'react'
import TitleBar from './TitleBar'
import ServerSidebar from '../server/ServerSidebar'
import ChannelSidebar from '../server/ChannelSidebar'
import ChatArea from '../chat/ChatArea'
import MemberList from '../server/MemberList'
import { useServerStore } from '../../stores/serverStore'

export default function MainLayout(): JSX.Element {
  const { activeServerId, fetchServers } = useServerStore()

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  return (
    <div className="h-screen w-screen flex flex-col bg-cyber-bg overflow-hidden">
      <TitleBar />

      {/* Neon accent line under title bar */}
      <div className="h-px bg-gradient-to-r from-transparent via-neon-cyan/50 to-transparent" />

      <div className="flex flex-1 overflow-hidden">
        <ServerSidebar />
        {activeServerId ? (
          <>
            <ChannelSidebar />
            <ChatArea />
            <MemberList />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="font-display text-2xl text-neon-cyan mb-2">NO SERVER SELECTED</h2>
              <p className="text-cyber-text-secondary font-mono text-sm">
                Select or create a server to begin
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
