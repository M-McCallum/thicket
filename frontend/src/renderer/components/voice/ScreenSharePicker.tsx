import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useEffect, useRef, useState } from 'react'

export function ScreenSharePicker() {
  const sources = useVoiceStore((s) => s.screenSharePickerSources)
  const startScreenShareWithSource = useVoiceStore((s) => s.startScreenShareWithSource)
  const dismiss = useVoiceStore((s) => s.dismissScreenSharePicker)
  const followWindowEnabled = useVoiceStore((s) => s.followWindowEnabled)
  const setFollowWindowEnabled = useVoiceStore((s) => s.setFollowWindowEnabled)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [hasFollowSupport, setHasFollowSupport] = useState(false)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dismiss])

  // Check if native follow-window addon is available
  useEffect(() => {
    if (window.api?.screen?.hasFollowSupport) {
      window.api.screen.hasFollowSupport().then(setHasFollowSupport)
    }
  }, [])

  if (!sources) return null

  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const windows = sources.filter((s) => s.id.startsWith('window:'))

  const isWindowSelected = selectedSource?.startsWith('window:') ?? false

  const handleShare = () => {
    if (!selectedSource) return
    startScreenShareWithSource(selectedSource, isWindowSelected ? followWindowEnabled : false)
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === overlayRef.current) dismiss() }}
    >
      <div className="bg-sol-bg-deep rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sol-border">
          <h2 className="text-sol-text-primary font-semibold text-lg">Share your screen</h2>
          <button onClick={dismiss} className="text-sol-text-secondary hover:text-sol-text-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {screens.length > 0 && (
            <section>
              <h3 className="text-sol-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Screens</h3>
              <div className="grid grid-cols-2 gap-3">
                {screens.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    selected={selectedSource === source.id}
                    onSelect={setSelectedSource}
                  />
                ))}
              </div>
            </section>
          )}
          {windows.length > 0 && (
            <section>
              <h3 className="text-sol-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Windows</h3>
              <div className="grid grid-cols-2 gap-3">
                {windows.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    selected={selectedSource === source.id}
                    onSelect={setSelectedSource}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer with follow toggle and share button */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-sol-border">
          <div className="flex items-center gap-2">
            {hasFollowSupport && isWindowSelected && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={followWindowEnabled}
                  onChange={(e) => setFollowWindowEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-sol-border text-sol-sage focus:ring-sol-sage accent-sol-sage"
                />
                <span className="text-sol-text-secondary text-sm">Follow application</span>
              </label>
            )}
          </div>
          <button
            onClick={handleShare}
            disabled={!selectedSource}
            className="px-4 py-2 rounded-lg bg-sol-sage text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sol-sage/90 transition-colors"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  )
}

function SourceCard({ source, selected, onSelect }: {
  source: { id: string; name: string; thumbnailDataUrl: string }
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      onClick={() => onSelect(source.id)}
      className={`group flex flex-col rounded-lg border-2 overflow-hidden transition-colors ${
        selected ? 'border-sol-sage' : 'border-transparent hover:border-sol-sage/50'
      } bg-sol-bg-elevated`}
    >
      <div className="aspect-video w-full bg-black/30 flex items-center justify-center">
        <img src={source.thumbnailDataUrl} alt={source.name} className="w-full h-full object-contain" />
      </div>
      <div className="px-3 py-2 text-sm text-sol-text-secondary group-hover:text-sol-text-primary truncate text-left">
        {source.name}
      </div>
    </button>
  )
}
