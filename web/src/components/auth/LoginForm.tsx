import { useAuthStore } from '@/stores/authStore'

export default function LoginForm() {
  const { startLogin, isLoading, error } = useAuthStore()

  const handleOAuthLogin = async () => {
    await startLogin()
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
      {/* Dappled sunlight overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.07] animate-dappled"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 120px 120px at 25% 30%, #e8a926, transparent), radial-gradient(ellipse 80px 100px at 70% 60%, #e8a926, transparent), radial-gradient(ellipse 100px 80px at 50% 80%, #5cba5c, transparent)',
          backgroundSize: '200% 200%'
        }}
      />

      <div className="w-full max-w-md mx-4 relative animate-grow-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black text-sol-amber tracking-wide">
            Thicket
          </h1>
          <p className="text-sol-text-secondary mt-2 font-mono text-sm">
            welcome to the grove
          </p>
        </div>

        {/* OAuth Login */}
        <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-sol-coral/10 border border-sol-coral/30 rounded-lg px-3 py-2 text-sol-coral text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleOAuthLogin}
            disabled={isLoading}
            className="btn-primary w-full py-3 font-display font-bold tracking-wide disabled:opacity-50"
          >
            {isLoading ? 'Growing...' : 'Enter the Grove'}
          </button>
        </div>
      </div>
    </div>
  )
}
