import { useDMCallStore } from '@renderer/stores/dmCallStore'

export default function IncomingCallOverlay() {
  const { incomingCall, acceptCall, declineCall } = useDMCallStore()

  if (!incomingCall) return null

  return (
    <div className="fixed top-4 right-4 z-50 animate-grow-in">
      <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 shadow-xl w-72">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-sol-sage/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-sol-sage animate-pulse">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
          </div>
          <div>
            <p className="text-sol-text-primary font-medium text-sm">{incomingCall.callerUsername}</p>
            <p className="text-sol-text-muted text-xs">Incoming voice call...</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={declineCall}
            className="flex-1 px-3 py-2 bg-sol-coral/20 text-sol-coral rounded-lg text-sm font-medium hover:bg-sol-coral/30 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={() => acceptCall(incomingCall.conversationId)}
            className="flex-1 px-3 py-2 bg-sol-sage/20 text-sol-sage rounded-lg text-sm font-medium hover:bg-sol-sage/30 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
