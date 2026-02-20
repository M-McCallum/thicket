import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import LoginForm from '@/components/auth/LoginForm'
import MainLayout from '@/components/layout/MainLayout'
import InviteRedirect from '@/components/server/InviteRedirect'
import NotFound from '@/components/NotFound'

function AuthCallback() {
  const { handleCallback, error } = useAuthStore()
  const navigate = useNavigate()
  const [processing, setProcessing] = useState(true)

  useEffect(() => {
    handleCallback()
      .then(() => navigate('/', { replace: true }))
      .catch(() => setProcessing(false))
  }, [handleCallback, navigate])

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
        <div className="text-center">
          <h2 className="font-display text-xl text-sol-coral mb-2">Authentication Failed</h2>
          <p className="text-sol-text-secondary text-sm mb-4">{error}</p>
          <button onClick={() => navigate('/', { replace: true })} className="btn-primary">
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (processing) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
        <div className="text-sol-amber font-display text-2xl animate-breathe">
          Authenticating...
        </div>
      </div>
    )
  }

  return <></>
}

function AppRoutes() {
  const { isAuthenticated, initAuth } = useAuthStore()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    initAuth().finally(() => setInitialized(true))
  }, [initAuth])

  if (!initialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
        <div className="text-sol-amber font-display text-2xl animate-breathe">
          Thicket
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/invite/:code" element={<InviteRedirect />} />
      <Route path="/" element={isAuthenticated ? <MainLayout /> : <LoginForm />} />
      <Route path="*" element={isAuthenticated ? <NotFound /> : <LoginForm />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
