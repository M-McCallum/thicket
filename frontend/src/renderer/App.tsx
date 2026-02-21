import { useEffect, useState } from 'react'
import { useAuthStore } from '@renderer/stores/authStore'
import { useThemeStore } from '@renderer/stores/themeStore'
import LoginForm from '@renderer/components/auth/LoginForm'
import MainLayout from '@renderer/components/layout/MainLayout'
import SettingsOverlay from '@renderer/components/settings/SettingsOverlay'

export default function App() {
  const { isAuthenticated, initAuth, handleCallback } = useAuthStore()
  const initTheme = useThemeStore((s) => s.initTheme)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    initAuth().finally(() => setInitialized(true))
  }, [initAuth])

  useEffect(() => {
    initTheme()
  }, [initTheme])

  // Listen for OAuth callback from main process
  useEffect(() => {
    if (typeof window.api?.auth?.onCallback !== 'function') return

    const unsubscribe = window.api.auth.onCallback((url: string) => {
      handleCallback(url)
    })

    return () => unsubscribe()
  }, [handleCallback])

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
    </>
  )
}
