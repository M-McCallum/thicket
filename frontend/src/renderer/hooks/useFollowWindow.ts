import { useEffect } from 'react'
import { useVoiceStore } from '@renderer/stores/voiceStore'

/**
 * Listens for follow-window IPC events and auto-switches screen share sources.
 * Should be mounted while the user is in a voice channel.
 */
export function useFollowWindow(): void {
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing)
  const followWindowEnabled = useVoiceStore((s) => s.followWindowEnabled)

  useEffect(() => {
    if (!isScreenSharing || !followWindowEnabled) return
    if (!window.api?.screen?.onSourceSwitched) return

    const cleanupSwitched = window.api.screen.onSourceSwitched((data) => {
      useVoiceStore.getState().switchScreenShareSource(data.sourceId, data.windowName)
    })

    const cleanupNewWindow = window.api.screen.onNewWindowDetected((data) => {
      // Auto-switch to the new window (same behavior as source-switched)
      useVoiceStore.getState().switchScreenShareSource(data.sourceId, data.windowName)
    })

    const cleanupClosed = window.api.screen.onFollowedAppClosed(() => {
      // The followed app closed all windows — stop screen sharing
      useVoiceStore.getState().toggleScreenShare()
    })

    return () => {
      cleanupSwitched()
      cleanupNewWindow()
      cleanupClosed()
    }
  }, [isScreenSharing, followWindowEnabled])
}
