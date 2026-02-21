import { create } from 'zustand'
import type { Room as RoomType, RemoteParticipant, Participant } from 'livekit-client'
import { voice } from '../services/api'
import { wsService } from '../services/ws'

export interface VoiceParticipant {
  userId: string
  username: string
  muted: boolean
  deafened: boolean
}

interface VoiceState {
  room: RoomType | null
  activeChannelId: string | null
  activeServerId: string | null
  participants: VoiceParticipant[]
  isMuted: boolean
  isDeafened: boolean
  speakingUserIds: string[]
  selectedInputDeviceId: string | null
  selectedOutputDeviceId: string | null

  joinVoiceChannel: (serverId: string, channelId: string) => Promise<void>
  leaveVoiceChannel: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  setInputDevice: (deviceId: string) => void
  setOutputDevice: (deviceId: string) => void
  addParticipant: (participant: VoiceParticipant) => void
  removeParticipant: (userId: string) => void
  clearParticipants: () => void
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  room: null,
  activeChannelId: null,
  activeServerId: null,
  participants: [],
  isMuted: false,
  isDeafened: false,
  speakingUserIds: [],
  selectedInputDeviceId: localStorage.getItem('voice:inputDeviceId'),
  selectedOutputDeviceId: localStorage.getItem('voice:outputDeviceId'),

  joinVoiceChannel: async (serverId, channelId) => {
    const { room: existingRoom } = get()
    if (existingRoom) {
      get().leaveVoiceChannel()
    }

    const { token, room: roomName } = await voice.getToken(serverId, channelId)
    const livekitUrl = 'ws://localhost:7880'

    const { Room, RoomEvent } = await import('livekit-client')
    const room = new Room()

    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      set((state) => ({
        participants: [
          ...state.participants,
          {
            userId: participant.identity,
            username: participant.name || participant.identity,
            muted: false,
            deafened: false
          }
        ]
      }))
    })

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      set((state) => ({
        participants: state.participants.filter((p) => p.userId !== participant.identity)
      }))
    })

    room.on(RoomEvent.TrackMuted, (_, participant) => {
      set((state) => ({
        participants: state.participants.map((p) =>
          p.userId === participant.identity ? { ...p, muted: true } : p
        )
      }))
    })

    room.on(RoomEvent.TrackUnmuted, (_, participant) => {
      set((state) => ({
        participants: state.participants.map((p) =>
          p.userId === participant.identity ? { ...p, muted: false } : p
        )
      }))
    })

    await room.connect(livekitUrl, token)

    // Enable microphone with saved device preference
    const savedInputId = get().selectedInputDeviceId
    await room.localParticipant.setMicrophoneEnabled(true, savedInputId ? { deviceId: savedInputId } : undefined)

    // Apply saved output device
    const savedOutputId = get().selectedOutputDeviceId
    if (savedOutputId) {
      await room.switchActiveDevice('audiooutput', savedOutputId)
    }

    // Track active speakers
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      set({ speakingUserIds: speakers.map((s) => s.identity) })
    })

    // Build initial participant list from existing participants
    const existingParticipants: VoiceParticipant[] = Array.from(
      room.remoteParticipants.values()
    ).map((p) => ({
      userId: p.identity,
      username: p.name || p.identity,
      muted: !p.isMicrophoneEnabled,
      deafened: false
    }))

    set({
      room,
      activeChannelId: channelId,
      activeServerId: serverId,
      participants: existingParticipants,
      isMuted: false,
      isDeafened: false
    })

    // Notify server via WebSocket
    wsService.send({
      type: 'VOICE_JOIN',
      data: { channel_id: channelId, server_id: serverId }
    })
  },

  leaveVoiceChannel: () => {
    const { room, activeChannelId, activeServerId } = get()

    if (room) {
      room.disconnect()
    }

    if (activeChannelId && activeServerId) {
      wsService.send({
        type: 'VOICE_LEAVE',
        data: { channel_id: activeChannelId, server_id: activeServerId }
      })
    }

    set({
      room: null,
      activeChannelId: null,
      activeServerId: null,
      participants: [],
      isMuted: false,
      isDeafened: false,
      speakingUserIds: []
    })
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
      // Deafen: disable all incoming audio tracks
      room.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            if (!isDeafened) {
              pub.track.detach()
            } else {
              pub.track.attach()
            }
          }
        })
      })
      set({ isDeafened: !isDeafened })
    }
  },

  setInputDevice: (deviceId) => {
    localStorage.setItem('voice:inputDeviceId', deviceId)
    set({ selectedInputDeviceId: deviceId })
    const { room } = get()
    if (room) {
      room.switchActiveDevice('audioinput', deviceId)
    }
  },

  setOutputDevice: (deviceId) => {
    localStorage.setItem('voice:outputDeviceId', deviceId)
    set({ selectedOutputDeviceId: deviceId })
    const { room } = get()
    if (room) {
      room.switchActiveDevice('audiooutput', deviceId)
    }
  },

  addParticipant: (participant) =>
    set((state) => ({
      participants: state.participants.some((p) => p.userId === participant.userId)
        ? state.participants
        : [...state.participants, participant]
    })),

  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.userId !== userId)
    })),

  clearParticipants: () => set({ participants: [] })
}))
