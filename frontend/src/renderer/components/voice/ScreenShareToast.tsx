import { useEffect } from 'react'
import { useVoiceStore } from '@renderer/stores/voiceStore'

export function ScreenShareToast() {
  const toast = useVoiceStore((s) => s.followWindowToast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      useVoiceStore.getState().setFollowWindowToast(null)
    }, 4000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-sol-bg-secondary/90 backdrop-blur border border-sol-border text-sol-text-primary text-sm shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
      {toast}
    </div>
  )
}
