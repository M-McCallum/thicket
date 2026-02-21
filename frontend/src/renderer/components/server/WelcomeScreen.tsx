import { useEffect, useState } from 'react'
import type { Server, Channel, OnboardingPrompt } from '@renderer/types/models'
import { onboarding as onboardingApi } from '@renderer/services/api'
import OnboardingFlow from './OnboardingFlow'

interface WelcomeScreenProps {
  server: Server
  channels: Channel[]
  onDismiss: () => void
  onChannelSelect: (channelId: string) => void
}

export default function WelcomeScreen({ server, channels, onDismiss, onChannelSelect }: WelcomeScreenProps) {
  const [prompts, setPrompts] = useState<OnboardingPrompt[]>([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    onboardingApi.getPrompts(server.id)
      .then((p) => setPrompts(p))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [server.id])

  const welcomeChannels = channels.filter((c) =>
    server.welcome_channels.includes(c.id)
  )

  const handleGetStarted = () => {
    if (prompts.length > 0) {
      setShowOnboarding(true)
    } else {
      handleComplete()
    }
  }

  const handleComplete = () => {
    // Mark completed with no selections if no prompts
    onboardingApi.complete(server.id, []).catch(() => {})
    onDismiss()
  }

  if (showOnboarding) {
    return (
      <OnboardingFlow
        serverId={server.id}
        prompts={prompts}
        onComplete={onDismiss}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sol-text-muted text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Server icon/name */}
        <div className="flex flex-col items-center gap-3">
          {server.icon_url ? (
            <img
              src={server.icon_url}
              alt={server.name}
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-sol-bg-elevated flex items-center justify-center">
              <span className="text-3xl font-bold text-sol-text-muted">
                {server.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-display font-bold text-sol-text-primary">
            Welcome to {server.name}!
          </h1>
        </div>

        {/* Welcome message */}
        {server.welcome_message && (
          <p className="text-sol-text-secondary text-sm leading-relaxed whitespace-pre-wrap">
            {server.welcome_message}
          </p>
        )}

        {/* Recommended channels */}
        {welcomeChannels.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-sol-text-muted">
              Channels to explore
            </h2>
            <div className="flex flex-col gap-1">
              {welcomeChannels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    onChannelSelect(ch.id)
                    onDismiss()
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sol-bg-secondary hover:bg-sol-bg-elevated transition-colors text-left"
                >
                  <span className="text-sol-text-muted text-sm">#</span>
                  <span className="text-sol-text-primary text-sm font-medium">{ch.name}</span>
                  {ch.topic && (
                    <span className="text-sol-text-muted text-xs truncate ml-2">{ch.topic}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Get started button */}
        <button
          onClick={handleGetStarted}
          className="px-6 py-2.5 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 transition-colors font-medium"
        >
          {prompts.length > 0 ? 'Get Started' : 'Dive In'}
        </button>
      </div>
    </div>
  )
}
