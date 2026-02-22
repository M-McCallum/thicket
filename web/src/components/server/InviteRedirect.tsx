import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useServerStore } from '@/stores/serverStore'
import { invites } from '@/services/api'
import type { ServerPreview } from '@/types/models'

export default function InviteRedirect() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { joinServer, setActiveServer } = useServerStore()
  const [preview, setPreview] = useState<ServerPreview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!code) return
    invites.preview(code)
      .then(setPreview)
      .catch(() => setError('Invalid or expired invite'))
      .finally(() => setIsLoading(false))
  }, [code])

  const handleJoin = async () => {
    if (!code) return
    setJoining(true)
    try {
      const server = await joinServer(code)
      await setActiveServer(server.id)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
      setJoining(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
        <div className="text-center">
          <h2 className="font-display text-xl text-sol-amber mb-2">You need to log in</h2>
          <p className="text-sol-text-secondary text-sm mb-4">Log in to accept this server invite.</p>
          <button onClick={() => navigate('/')} className="btn-primary">Go to Login</button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
        <div className="text-sol-amber font-display text-xl animate-breathe">Loading invite...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
        <div className="text-center">
          <h2 className="font-display text-xl text-sol-coral mb-2">Invalid Invite</h2>
          <p className="text-sol-text-secondary text-sm mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="btn-primary">Go Home</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
      <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-8 w-96 text-center animate-grow-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-sol-amber/20 flex items-center justify-center">
          <span className="font-display text-2xl font-bold text-sol-amber">
            {preview?.name?.charAt(0).toUpperCase()}
          </span>
        </div>
        <h2 className="font-display text-xl text-sol-text-primary mb-1">{preview?.name}</h2>
        <p className="text-sol-text-muted text-sm mb-6">
          {preview?.member_count} {preview?.member_count === 1 ? 'member' : 'members'}
        </p>
        <button
          onClick={handleJoin}
          disabled={joining}
          className="btn-primary w-full"
        >
          {joining ? 'Joining...' : 'Join Server'}
        </button>
        <a
          href={`thicket://invite/${code}`}
          className="block mt-3 text-xs text-sol-text-muted hover:text-sol-amber transition-colors"
        >
          Open in Desktop App
        </a>
      </div>
    </div>
  )
}
