import { useEffect, useState, useCallback } from 'react'
import { useStageStore } from '@renderer/stores/stageStore'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useHasPermission } from '@renderer/stores/permissionStore'
import { PermManageChannels } from '@renderer/types/permissions'

interface StageChannelViewProps {
  channelId: string
}

export default function StageChannelView({ channelId }: StageChannelViewProps) {
  const user = useAuthStore((s) => s.user)
  const members = useServerStore((s) => s.members)
  const canManageChannels = useHasPermission(PermManageChannels)
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds)

  const instance = useStageStore((s) => s.instance)
  const speakers = useStageStore((s) => s.speakers)
  const handRaises = useStageStore((s) => s.handRaises)
  const loading = useStageStore((s) => s.loading)

  const fetchStageInfo = useStageStore((s) => s.fetchStageInfo)
  const startStage = useStageStore((s) => s.startStage)
  const endStage = useStageStore((s) => s.endStage)
  const addSpeaker = useStageStore((s) => s.addSpeaker)
  const removeSpeaker = useStageStore((s) => s.removeSpeaker)
  const raiseHand = useStageStore((s) => s.raiseHand)
  const lowerHand = useStageStore((s) => s.lowerHand)
  const inviteToSpeak = useStageStore((s) => s.inviteToSpeak)

  const [showStartModal, setShowStartModal] = useState(false)
  const [topicInput, setTopicInput] = useState('')

  useEffect(() => {
    fetchStageInfo(channelId)
  }, [channelId, fetchStageInfo])

  const handleStartStage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    await startStage(channelId, topicInput)
    setShowStartModal(false)
    setTopicInput('')
  }, [channelId, topicInput, startStage])

  const handleEndStage = useCallback(async () => {
    await endStage(channelId)
  }, [channelId, endStage])

  const isCurrentUserSpeaker = user ? speakers.some((s) => s.user_id === user.id) : false
  const isCurrentUserInvited = user ? speakers.some((s) => s.user_id === user.id && s.invited) : false
  const hasCurrentUserRaisedHand = user ? handRaises.some((h) => h.user_id === user.id) : false
  const isStageStarter = user && instance ? instance.started_by === user.id : false

  const getMemberInfo = useCallback((userId: string) => {
    return members.find((m) => m.id === userId)
  }, [members])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sol-text-muted">Loading stage...</div>
      </div>
    )
  }

  // No active stage
  if (!instance) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-16 h-16 rounded-full bg-sol-bg-elevated flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
        <p className="text-sol-text-muted text-sm">No active stage session</p>
        {canManageChannels && (
          <button
            onClick={() => setShowStartModal(true)}
            className="btn-primary px-6"
          >
            Start Stage
          </button>
        )}

        {showStartModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowStartModal(false)}>
            <form
              onSubmit={handleStartStage}
              onClick={(e) => e.stopPropagation()}
              className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
            >
              <h3 className="font-display text-lg text-sol-amber mb-4">Start Stage</h3>
              <label className="block text-sm text-sol-text-secondary mb-1">Topic</label>
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                className="input-field mb-4"
                placeholder="What is this stage about?"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowStartModal(false)} className="btn-danger">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Start
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    )
  }

  // Active stage view
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Topic header */}
      <div className="px-6 py-4 border-b border-sol-bg-elevated bg-sol-bg-secondary">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-sol-sage animate-pulse" />
          <span className="text-xs font-mono text-sol-sage uppercase tracking-wider">Live Stage</span>
        </div>
        <h2 className="text-lg font-display text-sol-text-primary">
          {instance.topic || 'Untitled Stage'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Speakers section */}
        <section>
          <h3 className="text-xs font-mono text-sol-text-muted uppercase tracking-wider mb-3">
            Speakers - {speakers.filter((s) => !s.invited).length}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {speakers.filter((s) => !s.invited).map((speaker) => {
              const member = getMemberInfo(speaker.user_id)
              const isSpeaking = speakingUserIds.includes(speaker.user_id)
              return (
                <div
                  key={speaker.user_id}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl bg-sol-bg-elevated/50 transition-all ${
                    isSpeaking ? 'ring-2 ring-sol-sage/60' : ''
                  }`}
                >
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold ${
                    isSpeaking
                      ? 'bg-sol-sage/20 text-sol-sage ring-2 ring-sol-sage/40 animate-pulse'
                      : 'bg-sol-bg-secondary text-sol-text-muted'
                  }`}>
                    {member?.avatar_url ? (
                      <img src={member.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                    ) : (
                      (member?.username?.[0] ?? '?').toUpperCase()
                    )}
                  </div>
                  <span className="text-sm text-sol-text-primary text-center truncate max-w-full">
                    {member?.display_name ?? member?.username ?? speaker.user_id.slice(0, 8)}
                  </span>
                  {(canManageChannels || isStageStarter) && user && speaker.user_id !== user.id && (
                    <button
                      onClick={() => removeSpeaker(channelId, speaker.user_id)}
                      className="text-xs text-sol-text-muted hover:text-sol-red transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Invited speakers (pending acceptance) */}
        {speakers.filter((s) => s.invited).length > 0 && (
          <section>
            <h3 className="text-xs font-mono text-sol-text-muted uppercase tracking-wider mb-3">
              Invited to Speak
            </h3>
            <div className="flex flex-wrap gap-3">
              {speakers.filter((s) => s.invited).map((speaker) => {
                const member = getMemberInfo(speaker.user_id)
                const isMe = user?.id === speaker.user_id
                return (
                  <div
                    key={speaker.user_id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sol-amber/10 border border-sol-amber/20"
                  >
                    <div className="w-8 h-8 rounded-full bg-sol-bg-secondary flex items-center justify-center text-xs font-bold text-sol-text-muted">
                      {member?.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        (member?.username?.[0] ?? '?').toUpperCase()
                      )}
                    </div>
                    <span className="text-sm text-sol-text-primary">
                      {member?.display_name ?? member?.username ?? speaker.user_id.slice(0, 8)}
                    </span>
                    {isMe && (
                      <button
                        onClick={() => addSpeaker(channelId)}
                        className="text-xs px-2 py-0.5 rounded bg-sol-sage/20 text-sol-sage hover:bg-sol-sage/30 transition-colors"
                      >
                        Accept
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Hand raises section (visible to moderators) */}
        {(canManageChannels || isStageStarter) && handRaises.length > 0 && (
          <section>
            <h3 className="text-xs font-mono text-sol-text-muted uppercase tracking-wider mb-3">
              Raised Hands - {handRaises.length}
            </h3>
            <div className="flex flex-wrap gap-3">
              {handRaises.map((raise) => {
                const member = getMemberInfo(raise.user_id)
                return (
                  <div
                    key={raise.user_id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sol-bg-elevated/50"
                  >
                    <span className="text-base">&#9995;</span>
                    <div className="w-8 h-8 rounded-full bg-sol-bg-secondary flex items-center justify-center text-xs font-bold text-sol-text-muted">
                      {member?.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        (member?.username?.[0] ?? '?').toUpperCase()
                      )}
                    </div>
                    <span className="text-sm text-sol-text-primary">
                      {member?.display_name ?? member?.username ?? raise.user_id.slice(0, 8)}
                    </span>
                    <button
                      onClick={() => inviteToSpeak(channelId, raise.user_id)}
                      className="text-xs px-2 py-0.5 rounded bg-sol-sage/20 text-sol-sage hover:bg-sol-sage/30 transition-colors"
                    >
                      Invite
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* Bottom controls bar */}
      <div className="px-6 py-4 border-t border-sol-bg-elevated bg-sol-bg-secondary flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Audience members: raise/lower hand */}
          {!isCurrentUserSpeaker && !isCurrentUserInvited && (
            <button
              onClick={() => hasCurrentUserRaisedHand ? lowerHand(channelId) : raiseHand(channelId)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                hasCurrentUserRaisedHand
                  ? 'bg-sol-amber/20 text-sol-amber hover:bg-sol-amber/30'
                  : 'bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-elevated/80'
              }`}
            >
              <span>&#9995;</span>
              {hasCurrentUserRaisedHand ? 'Lower Hand' : 'Raise Hand'}
            </button>
          )}

          {/* If invited, show accept button */}
          {isCurrentUserInvited && !isCurrentUserSpeaker && (
            <button
              onClick={() => addSpeaker(channelId)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-sol-sage/20 text-sol-sage hover:bg-sol-sage/30 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
              </svg>
              Join as Speaker
            </button>
          )}

          {/* If speaker, option to move back to audience */}
          {isCurrentUserSpeaker && user && !isStageStarter && (
            <button
              onClick={() => removeSpeaker(channelId, user.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-sol-bg-elevated text-sol-text-secondary hover:text-sol-text-primary transition-colors"
            >
              Move to Audience
            </button>
          )}
        </div>

        {/* End stage button (for moderators / stage starter) */}
        {(canManageChannels || isStageStarter) && (
          <button
            onClick={handleEndStage}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-sol-red/20 text-sol-red hover:bg-sol-red/30 transition-colors"
          >
            End Stage
          </button>
        )}
      </div>
    </div>
  )
}
