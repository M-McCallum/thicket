const isMac = navigator.platform.toUpperCase().includes('MAC')

export default function TitleBar() {
  return (
    <div className="h-8 bg-sol-bg flex items-center justify-between px-3 titlebar-drag border-b border-sol-bg-elevated"
      style={isMac ? { paddingLeft: '78px' } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-xs text-sol-amber font-bold tracking-widest">
          Thicket
        </span>
        <div className="w-px h-3 bg-sol-bg-elevated" />
        <span className="text-sol-text-muted text-xs font-mono">v{__APP_VERSION__}</span>
      </div>

      {/* Window controls — only needed on Windows/Linux; macOS uses native traffic lights */}
      {!isMac && (
        <div className="flex items-center titlebar-no-drag">
          <button
            onClick={() => window.api?.minimizeWindow()}
            className="w-8 h-8 flex items-center justify-center text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-secondary transition-colors"
            aria-label="Minimize"
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
              <rect width="10" height="1" />
            </svg>
          </button>
          <button
            onClick={() => window.api?.maximizeWindow()}
            className="w-8 h-8 flex items-center justify-center text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-secondary transition-colors"
            aria-label="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          </button>
          <button
            onClick={() => window.api?.closeWindow()}
            className="w-8 h-8 flex items-center justify-center text-sol-text-secondary hover:text-sol-coral hover:bg-sol-coral/10 transition-colors"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
              <line x1="0" y1="0" x2="10" y2="10" />
              <line x1="10" y1="0" x2="0" y2="10" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
