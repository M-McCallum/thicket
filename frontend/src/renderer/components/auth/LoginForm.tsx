import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'

export default function LoginForm(): JSX.Element {
  const [isSignup, setIsSignup] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, signup, isLoading, error, clearError } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSignup) {
      await signup(username, email, password)
    } else {
      await login(email, password)
    }
  }

  const toggleMode = () => {
    setIsSignup(!isSignup)
    clearError()
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-cyber-bg">
      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-5">
        <div className="w-full h-[200%] bg-gradient-to-b from-transparent via-neon-cyan/10 to-transparent animate-scanline" />
      </div>

      <div className="w-full max-w-md mx-4 relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black text-neon-cyan tracking-wider">
            NEONCORE
          </h1>
          <p className="text-cyber-text-secondary mt-2 font-mono text-sm">
            {isSignup ? '// CREATE IDENTITY' : '// AUTHENTICATE'}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-cyber-bg-secondary border border-cyber-bg-elevated rounded-lg p-6 space-y-4"
        >
          {error && (
            <div className="bg-neon-red/10 border border-neon-red/30 rounded px-3 py-2 text-neon-red text-sm">
              {error}
            </div>
          )}

          {isSignup && (
            <div>
              <label className="block text-cyber-text-secondary text-sm mb-1 font-mono">
                USERNAME
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="netrunner"
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
              />
            </div>
          )}

          <div>
            <label className="block text-cyber-text-secondary text-sm mb-1 font-mono">
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="runner@neoncore.app"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-cyber-text-secondary text-sm mb-1 font-mono">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3 font-display font-bold tracking-wider disabled:opacity-50"
          >
            {isLoading ? 'CONNECTING...' : isSignup ? 'CREATE ACCOUNT' : 'JACK IN'}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={toggleMode}
              className="text-cyber-text-secondary hover:text-neon-cyan text-sm transition-colors"
            >
              {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
