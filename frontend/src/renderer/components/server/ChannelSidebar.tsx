import { useServerStore } from '../../stores/serverStore'

export default function ChannelSidebar(): JSX.Element {
  const { channels, activeChannelId, setActiveChannel, servers, activeServerId } = useServerStore()
  const activeServer = servers.find((s) => s.id === activeServerId)

  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  return (
    <div className="w-60 bg-cyber-bg-secondary flex flex-col border-r border-cyber-bg-elevated">
      {/* Server name header */}
      <div className="h-12 flex items-center px-4 border-b border-cyber-bg-elevated">
        <h2 className="font-display text-sm font-bold text-cyber-text-primary truncate tracking-wider">
          {activeServer?.name ?? 'Server'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Text channels */}
        {textChannels.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 text-xs font-mono text-cyber-text-muted uppercase tracking-wider">
              Text Channels
            </div>
            {textChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={`w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors
                  ${
                    activeChannelId === channel.id
                      ? 'text-neon-cyan bg-neon-cyan/10'
                      : 'text-cyber-text-secondary hover:text-cyber-text-primary hover:bg-cyber-bg-elevated/50'
                  }`}
              >
                <span className="text-cyber-text-muted">#</span>
                <span className="text-sm truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Voice channels */}
        {voiceChannels.length > 0 && (
          <div>
            <div className="px-3 py-1 text-xs font-mono text-cyber-text-muted uppercase tracking-wider">
              Voice Channels
            </div>
            {voiceChannels.map((channel) => (
              <button
                key={channel.id}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2
                           text-cyber-text-secondary hover:text-cyber-text-primary hover:bg-cyber-bg-elevated/50 transition-colors"
              >
                <span className="text-neon-purple/50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-1 14.93A7.004 7.004 0 015 9h2a5 5 0 0010 0h2a7.004 7.004 0 01-6 6.93V20h4v2H8v-2h4v-4.07z" />
                  </svg>
                </span>
                <span className="text-sm truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Invite code */}
      {activeServer && (
        <div className="p-3 border-t border-cyber-bg-elevated">
          <div className="text-xs font-mono text-cyber-text-muted mb-1">INVITE CODE</div>
          <div className="text-xs font-mono text-neon-cyan bg-cyber-bg/50 px-2 py-1 rounded select-all">
            {activeServer.invite_code}
          </div>
        </div>
      )}
    </div>
  )
}
