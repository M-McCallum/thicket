import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-sol-bg">
      <div className="text-center">
        <h1 className="font-display text-6xl text-sol-amber mb-2">404</h1>
        <h2 className="font-display text-xl text-sol-text-primary mb-2">Page Not Found</h2>
        <p className="text-sol-text-muted text-sm mb-6 font-mono">
          You wandered off the trail.
        </p>
        <button onClick={() => navigate('/', { replace: true })} className="btn-primary">
          Back to Thicket
        </button>
      </div>
    </div>
  )
}
