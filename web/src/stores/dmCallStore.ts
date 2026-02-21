import { create } from 'zustand'
import { Room, RoomEvent, RemoteParticipant, Participant, Track, RemoteTrack, RemoteTrackPublication } from 'livekit-client'
import { dm } from '@/services/api'
import { wsService } from '@/services/ws'

export interface DMCallParticipant {
  userId: string
  username: string
  muted: boolean
}

interface DMCallState {
  room: Room | null
  activeConversationId: string | null
  isMuted: boolean
  isDeafened: boolean
  participants: DMCallParticipant[]
  incomingCall: { conversationId: string; callerId: string; callerUsername: string } | null

  startCall: (conversationId: string) => Promise<void>
  acceptCall: (conversationId: string) => Promise<void>
  endCall: () => void
  declineCall: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  setIncomingCall: (call: { conversationId: string; callerId: string; callerUsername: string } | null) => void
}

export const useDMCallStore = create<DMCallState>((set, get) => ({
  room: null,
  activeConversationId: null,
  isMuted: false,
  isDeafened: false,
  participants: [],
  incomingCall: null,

  startCall: async (conversationId) => {
    const { room: existing } = get()
    if (existing) get().endCall()

    wsService.send({ type: 'DM_CALL_START', data: { conversation_id: conversationId } })

    const { token } = await dm.getVoiceToken(conversationId)
    const livekitUrl = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'
    const room = new Room()

    // Explicitly attach audio tracks for autoplay policy compliance
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) track.attach()
    })
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) track.detach()
    })

    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      set((s) => ({
        participants: [...s.participants, { userId: p.identity, username: p.name || p.identity, muted: false }]
      }))
    })
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      set((s) => ({ participants: s.participants.filter((x) => x.userId !== p.identity) }))
    })
    room.on(RoomEvent.TrackMuted, (_, p) => {
      set((s) => ({
        participants: s.participants.map((x) => x.userId === p.identity ? { ...x, muted: true } : x)
      }))
    })
    room.on(RoomEvent.TrackUnmuted, (_, p) => {
      set((s) => ({
        participants: s.participants.map((x) => x.userId === p.identity ? { ...x, muted: false } : x)
      }))
    })

    await room.connect(livekitUrl, token)
    await room.startAudio()
    await room.localParticipant.setMicrophoneEnabled(true)

    const existing_participants: DMCallParticipant[] = Array.from(room.remoteParticipants.values()).map((p) => ({
      userId: p.identity,
      username: p.name || p.identity,
      muted: !p.isMicrophoneEnabled
    }))

    set({ room, activeConversationId: conversationId, participants: existing_participants, isMuted: false, isDeafened: false })
  },

  acceptCall: async (conversationId) => {
    set({ incomingCall: null })

    wsService.send({ type: 'DM_CALL_ACCEPT', data: { conversation_id: conversationId } })

    const { token } = await dm.getVoiceToken(conversationId)
    const livekitUrl = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'
    const room = new Room()

    // Explicitly attach audio tracks for autoplay policy compliance
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) track.attach()
    })
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) track.detach()
    })

    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      set((s) => ({
        participants: [...s.participants, { userId: p.identity, username: p.name || p.identity, muted: false }]
      }))
    })
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      set((s) => ({ participants: s.participants.filter((x) => x.userId !== p.identity) }))
    })

    await room.connect(livekitUrl, token)
    await room.startAudio()
    await room.localParticipant.setMicrophoneEnabled(true)

    const existing_participants: DMCallParticipant[] = Array.from(room.remoteParticipants.values()).map((p) => ({
      userId: p.identity,
      username: p.name || p.identity,
      muted: !p.isMicrophoneEnabled
    }))

    set({ room, activeConversationId: conversationId, participants: existing_participants, isMuted: false, isDeafened: false })
  },

  endCall: () => {
    const { room, activeConversationId } = get()
    if (room) room.disconnect()
    if (activeConversationId) {
      wsService.send({ type: 'DM_CALL_END', data: { conversation_id: activeConversationId } })
    }
    set({ room: null, activeConversationId: null, participants: [], isMuted: false, isDeafened: false })
  },

  declineCall: () => {
    const { incomingCall } = get()
    if (incomingCall) {
      wsService.send({ type: 'DM_CALL_END', data: { conversation_id: incomingCall.conversationId } })
    }
    set({ incomingCall: null })
  },

  toggleMute: () => {
    const { room, isMuted } = get()
    if (room) {
      room.localParticipant.setMicrophoneEnabled(isMuted)
      set({ isMuted: !isMuted })
    }
  },

  toggleDeafen: () => {
    const { room, isDeafened } = get()
    if (room) {
      room.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            if (!isDeafened) pub.track.detach()
            else pub.track.attach()
          }
        })
      })
      set({ isDeafened: !isDeafened })
    }
  },

  setIncomingCall: (call) => set({ incomingCall: call })
}))
