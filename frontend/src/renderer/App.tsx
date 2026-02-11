import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import LoginForm from './components/auth/LoginForm'
import MainLayout from './components/layout/MainLayout'

export default function App(): JSX.Element {
  const { isAuthenticated, setTokensFromStorage } = useAuthStore()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')
    const userJson = localStorage.getItem('user')

    if (accessToken && refreshToken && userJson) {
      try {
        const user = JSON.parse(userJson)
        setTokensFromStorage(accessToken, refreshToken, user)
      } catch {
        // Invalid stored data, ignore
      }
    }
    setInitialized(true)
  }, [setTokensFromStorage])

  if (!initialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-cyber-bg">
        <div className="text-neon-cyan font-display text-2xl animate-pulse-neon">
          THICKET
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return <MainLayout />
}
