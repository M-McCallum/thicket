import { useUpdateStore } from '@renderer/stores/updateStore'

export default function UpdateNotification() {
  const status = useUpdateStore((s) => s.status)
  const version = useUpdateStore((s) => s.version)
  const percent = useUpdateStore((s) => s.percent)
  const errorMessage = useUpdateStore((s) => s.errorMessage)
  const dismissed = useUpdateStore((s) => s.dismissed)
  const downloadUpdate = useUpdateStore((s) => s.downloadUpdate)
  const installUpdate = useUpdateStore((s) => s.installUpdate)
  const dismiss = useUpdateStore((s) => s.dismiss)

  if (dismissed) return null
  if (status === 'idle' || status === 'checking' || status === 'up-to-date') return null

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-sol-amber/15 border-b border-sol-amber/30 text-xs font-mono">
      <div className="flex items-center gap-2 min-w-0">
        {status === 'available' && (
          <>
            <span className="text-sol-amber">Update v{version} available</span>
            <button
              onClick={downloadUpdate}
              className="px-2 py-0.5 bg-sol-amber/20 hover:bg-sol-amber/30 text-sol-amber rounded transition-colors"
            >
              Download
            </button>
          </>
        )}

        {status === 'downloading' && (
          <>
            <span className="text-sol-amber">Downloading update...</span>
            <div className="w-32 h-1.5 bg-sol-bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-sol-amber rounded-full transition-all duration-300"
                style={{ width: `${Math.round(percent)}%` }}
              />
            </div>
            <span className="text-sol-text-muted">{Math.round(percent)}%</span>
          </>
        )}

        {status === 'ready' && (
          <>
            <span className="text-sol-sage">Update ready to install</span>
            <button
              onClick={installUpdate}
              className="px-2 py-0.5 bg-sol-sage/20 hover:bg-sol-sage/30 text-sol-sage rounded transition-colors"
            >
              Restart now
            </button>
          </>
        )}

        {status === 'error' && (
          <span className="text-sol-coral truncate">Update error: {errorMessage}</span>
        )}
      </div>

      {(status === 'available' || status === 'ready' || status === 'error') && (
        <button
          onClick={dismiss}
          className="ml-2 text-sol-text-muted hover:text-sol-text-primary flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      )}
    </div>
  )
}
