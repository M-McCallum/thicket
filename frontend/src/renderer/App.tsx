import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import LoginForm from './components/auth/LoginForm'
import MainLayout from './components/layout/MainLayout'

export default function App(): JSX.Element {
  const { isAuthenticated, initAuth, handleCallback } = useAuthStore()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    initAuth().finally(() => setInitialized(true))
  }, [initAuth])

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

  return <MainLayout />
}
