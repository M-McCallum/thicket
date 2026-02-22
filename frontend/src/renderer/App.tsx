import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@renderer/stores/authStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useUpdateStore } from '@renderer/stores/updateStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { invites } from '@renderer/services/api'
import LoginForm from '@renderer/components/auth/LoginForm'
import MainLayout from '@renderer/components/layout/MainLayout'
import SettingsOverlay from '@renderer/components/settings/SettingsOverlay'
import type { ServerPreview } from '@renderer/types/models'

export default function App() {
  const { isAuthenticated, initAuth, handleCallback } = useAuthStore()
  const initTheme = useThemeStore((s) => s.initTheme)
  const initUpdater = useUpdateStore((s) => s.initUpdater)
  const joinServer = useServerStore((s) => s.joinServer)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const [initialized, setInitialized] = useState(false)
  const [inviteOverlay, setInviteOverlay] = useState<{ code: string; preview: ServerPreview | null; error: string; joining: boolean } | null>(null)

  useEffect(() => {
    initAuth().finally(() => setInitialized(true))
  }, [initAuth])

  useEffect(() => {
    initTheme()
  }, [initTheme])

  useEffect(() => {
    return initUpdater()
  }, [initUpdater])

  // Listen for OAuth callback from main process
  useEffect(() => {
    if (typeof window.api?.auth?.onCallback !== 'function') return

    const unsubscribe = window.api.auth.onCallback((url: string) => {
      handleCallback(url)
    })

    return () => unsubscribe()
  }, [handleCallback])

  const handleInviteLink = useCallback(async (code: string) => {
    setInviteOverlay({ code, preview: null, error: '', joining: false })
    try {
      const preview = await invites.preview(code)
      setInviteOverlay((prev) => prev ? { ...prev, preview } : null)
    } catch {
      setInviteOverlay((prev) => prev ? { ...prev, error: 'Invalid or expired invite' } : null)
    }
  }, [])

  const handleInviteJoin = useCallback(async () => {
    if (!inviteOverlay) return
    setInviteOverlay((prev) => prev ? { ...prev, joining: true } : null)
    try {
      const server = await joinServer(inviteOverlay.code)
      await setActiveServer(server.id)
      setInviteOverlay(null)
    } catch (err) {
      setInviteOverlay((prev) => prev ? { ...prev, joining: false, error: err instanceof Error ? err.message : 'Failed to join' } : null)
    }
  }, [inviteOverlay, joinServer, setActiveServer])

  // Listen for invite deep links from main process
  useEffect(() => {
    if (typeof window.api?.invite?.onInviteLink !== 'function') return

    const unsubscribe = window.api.invite.onInviteLink((code: string) => {
      handleInviteLink(code)
    })

    return () => unsubscribe()
  }, [handleInviteLink])

  if (!initialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
        <div className="text-sol-amber font-display text-2xl animate-breathe">
          Thicket
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return (
    <>
      <MainLayout />
      <SettingsOverlay />
      {inviteOverlay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={() => setInviteOverlay(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-8 w-96 text-center animate-grow-in">
            {inviteOverlay.error && !inviteOverlay.preview ? (
              <>
                <h2 className="font-display text-xl text-sol-coral mb-2">Invalid Invite</h2>
                <p className="text-sol-text-secondary text-sm mb-4">{inviteOverlay.error}</p>
                <button onClick={() => setInviteOverlay(null)} className="btn-primary w-full">Close</button>
              </>
            ) : inviteOverlay.preview ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-sol-amber/20 flex items-center justify-center">
                  <span className="font-display text-2xl font-bold text-sol-amber">
                    {inviteOverlay.preview.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <h2 className="font-display text-xl text-sol-text-primary mb-1">{inviteOverlay.preview.name}</h2>
                <p className="text-sol-text-muted text-sm mb-6">
                  {inviteOverlay.preview.member_count} {inviteOverlay.preview.member_count === 1 ? 'member' : 'members'}
                </p>
                {inviteOverlay.error && <p className="text-sm text-sol-coral mb-3">{inviteOverlay.error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setInviteOverlay(null)} className="flex-1 px-4 py-2 bg-sol-bg-elevated text-sol-text-secondary rounded-lg hover:bg-sol-bg-elevated/80 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleInviteJoin} disabled={inviteOverlay.joining} className="btn-primary flex-1">
                    {inviteOverlay.joining ? 'Joining...' : 'Join Server'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sol-amber font-display text-lg animate-breathe">Loading invite...</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
