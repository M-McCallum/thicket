import { useVoiceStore } from '@/stores/voiceStore'
import { useServerStore } from '@/stores/serverStore'

export default function VoiceControls() {
  const { activeChannelId, activeServerId, isMuted, isDeafened, leaveVoiceChannel, toggleMute, toggleDeafen } =
    useVoiceStore()
  const { channels } = useServerStore()

  if (!activeChannelId) return null

  const channel = channels.find((c) => c.id === activeChannelId)

  return (
    <div className="p-3 bg-sol-bg border-t border-sol-bg-elevated">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sol-sage text-xs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-1 14.93A7.004 7.004 0 015 9h2a5 5 0 0010 0h2a7.004 7.004 0 01-6 6.93V20h4v2H8v-2h4v-4.07z" />
            </svg>
          </span>
          <span className="text-xs text-sol-text-primary truncate font-mono">
            {channel?.name ?? 'Voice'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`flex-1 p-1.5 rounded text-xs font-mono transition-colors ${
            isMuted
              ? 'bg-sol-amber/20 text-sol-amber'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? 'Muted' : 'Mic'}
        </button>

        {/* Deafen */}
        <button
          onClick={toggleDeafen}
          className={`flex-1 p-1.5 rounded text-xs font-mono transition-colors ${
            isDeafened
              ? 'bg-sol-amber/20 text-sol-amber'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? 'Deaf' : 'Audio'}
        </button>

        {/* Disconnect */}
        <button
          onClick={leaveVoiceChannel}
          className="flex-1 p-1.5 rounded text-xs font-mono bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
          title="Disconnect"
        >
          Leave
        </button>
      </div>
    </div>
  )
}
