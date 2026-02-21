import { useState } from 'react'
import type { OnboardingPrompt } from '@/types/models'
import { onboarding as onboardingApi } from '@/services/api'

interface OnboardingFlowProps {
  serverId: string
  prompts: OnboardingPrompt[]
  onComplete: () => void
}

export default function OnboardingFlow({ serverId, prompts, onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0)
  // selections maps prompt ID -> set of selected option IDs
  const [selections, setSelections] = useState<Record<string, Set<string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const prompt = prompts[currentStep]
  const isLast = currentStep === prompts.length - 1
  const currentSelections = selections[prompt?.id] ?? new Set<string>()

  const toggleOption = (optionId: string) => {
    setSelections((prev) => {
      const promptId = prompt.id
      const existing = prev[promptId] ?? new Set<string>()
      const next = new Set(existing)
      if (next.has(optionId)) {
        next.delete(optionId)
      } else {
        next.add(optionId)
      }
      return { ...prev, [promptId]: next }
    })
  }

  const canProceed = !prompt?.required || currentSelections.size > 0

  const handleNext = () => {
    if (!canProceed) return
    if (isLast) {
      handleSubmit()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    // Collect all selected option IDs
    const allSelectedIds: string[] = []
    for (const optSet of Object.values(selections)) {
      for (const id of optSet) {
        allSelectedIds.push(id)
      }
    }

    try {
      await onboardingApi.complete(serverId, allSelectedIds)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding')
      setSubmitting(false)
    }
  }

  if (!prompt) return null

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        {/* Progress indicator */}
        <div className="flex items-center gap-1 justify-center">
          {prompts.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-colors ${
                i === currentStep
                  ? 'w-8 bg-sol-amber'
                  : i < currentStep
                    ? 'w-4 bg-sol-amber/40'
                    : 'w-4 bg-sol-bg-elevated'
              }`}
            />
          ))}
        </div>

        <div className="text-center text-xs text-sol-text-muted font-mono uppercase tracking-wider">
          Step {currentStep + 1} of {prompts.length}
        </div>

        {/* Prompt */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-display font-bold text-sol-text-primary">
            {prompt.title}
          </h2>
          {prompt.description && (
            <p className="text-sol-text-secondary text-sm">{prompt.description}</p>
          )}
          {prompt.required && (
            <span className="inline-block text-xs text-sol-coral font-mono">Required</span>
          )}
        </div>

        {/* Options */}
        <div className="grid gap-2">
          {prompt.options.map((opt) => {
            const selected = currentSelections.has(opt.id)
            return (
              <button
                key={opt.id}
                onClick={() => toggleOption(opt.id)}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                  selected
                    ? 'border-sol-amber bg-sol-amber/10'
                    : 'border-sol-bg-elevated bg-sol-bg-secondary hover:bg-sol-bg-elevated'
                }`}
              >
                {/* Checkbox indicator */}
                <div className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${
                  selected ? 'border-sol-amber bg-sol-amber/20' : 'border-sol-bg-elevated'
                }`}>
                  {selected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-sol-amber">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                    <span className="text-sm font-medium text-sol-text-primary">{opt.label}</span>
                  </div>
                  {opt.description && (
                    <p className="text-xs text-sol-text-muted mt-0.5">{opt.description}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {error && <p className="text-sm text-sol-coral text-center">{error}</p>}

        {/* Navigation */}
        <div className="flex justify-between items-center pt-2">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="px-4 py-2 text-sol-text-muted hover:text-sol-text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed || submitting}
            className="px-6 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors font-medium"
          >
            {submitting ? 'Finishing...' : isLast ? 'Complete' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
