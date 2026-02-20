import { useState } from 'react'
import { useVoiceStore } from '@/stores/voiceStore'
import { useServerStore } from '@/stores/serverStore'
import VoiceSettingsModal from './VoiceSettingsModal'

export default function VoiceControls() {
  const { activeChannelId, isMuted, isDeafened, localAudioLevel, leaveVoiceChannel, toggleMute, toggleDeafen } =
    useVoiceStore()
  const { channels } = useServerStore()
  const [showSettings, setShowSettings] = useState(false)

  if (!activeChannelId) return null

  const channel = channels.find((c) => c.id === activeChannelId)
  const micActive = !isMuted && localAudioLevel > 0.01

  return (
    <div className="p-3 bg-sol-bg border-t border-sol-bg-elevated">
      {/* Channel name + connection status */}
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span className="text-sol-sage text-xs">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-1 14.93A7.004 7.004 0 015 9h2a5 5 0 0010 0h2a7.004 7.004 0 01-6 6.93V20h4v2H8v-2h4v-4.07z" />
          </svg>
        </span>
        <span className="text-xs text-sol-text-primary truncate font-mono">
          {channel?.name ?? 'Voice'}
        </span>
        <span className="flex items-center gap-1 ml-auto shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-sol-sage animate-pulse" />
          <span className="text-[10px] text-sol-sage font-mono">Connected</span>
        </span>
      </div>

      {/* Audio level meter */}
      <div className="h-1 bg-sol-bg-elevated rounded-full mb-2 overflow-hidden">
        <div
          className="h-full bg-sol-sage rounded-full transition-[width] duration-75"
          style={{ width: `${Math.min(localAudioLevel * 100, 100)}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`flex-1 flex items-center justify-center p-1.5 rounded transition-colors ${
            isMuted
              ? 'bg-sol-amber/20 text-sol-amber'
              : micActive
                ? 'bg-sol-bg-elevated text-sol-sage ring-1 ring-sol-sage/50'
                : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            // Mic off
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              <path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            // Mic on
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="14" rx="3" />
              <path d="M19 12a7 7 0 01-14 0" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Deafen */}
        <button
          onClick={toggleDeafen}
          className={`flex-1 flex items-center justify-center p-1.5 rounded transition-colors ${
            isDeafened
              ? 'bg-sol-amber/20 text-sol-amber'
              : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary'
          }`}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? (
            // Headphones off
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M3.54 12A9 9 0 0121 12" />
              <path d="M3 12v6a1 1 0 001 1h2a1 1 0 001-1v-4" />
              <path d="M21 12v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-4" />
            </svg>
          ) : (
            // Headphones on
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0118 0v6" />
              <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
            </svg>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="flex-1 flex items-center justify-center p-1.5 rounded bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary transition-colors"
          title="Voice Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* Disconnect */}
        <button
          onClick={leaveVoiceChannel}
          className="flex-1 flex items-center justify-center p-1.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
          title="Disconnect"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.73.8 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-6-6A19.79 19.79 0 012 4.18 2 2 0 014 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>

      {showSettings && <VoiceSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
