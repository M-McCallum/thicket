import { create } from 'zustand'
import { Room, RoomEvent, Track, RemoteParticipant, Participant, RemoteTrackPublication, RemoteTrack } from 'livekit-client'
import { voice } from '@/services/api'
import { wsService } from '@/services/ws'
import { soundService } from '@/services/soundService'

export type VideoLayoutMode = 'grid' | 'focus'
export type VideoQuality = 'auto' | '720p' | '480p' | '360p'

export interface VoiceParticipant {
  userId: string
  username: string
  muted: boolean
  deafened: boolean
  cameraEnabled: boolean
  screenShareEnabled: boolean
  videoTrack: Track | null
  screenTrack: Track | null
}

interface VoiceState {
  room: Room | null
  activeChannelId: string | null
  activeServerId: string | null
  participants: VoiceParticipant[]
  isMuted: boolean
  isDeafened: boolean
  speakingUserIds: string[]
  selectedInputDeviceId: string | null
  selectedOutputDeviceId: string | null

  // Video state
  isCameraEnabled: boolean
  isScreenSharing: boolean
  selectedVideoDeviceId: string | null
  videoLayoutMode: VideoLayoutMode
  focusedParticipantId: string | null
  isPiPActive: boolean
  videoQuality: VideoQuality
  localTrackVersion: number

  joinVoiceChannel: (serverId: string, channelId: string) => Promise<void>
  leaveVoiceChannel: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  setInputDevice: (deviceId: string) => void
  setOutputDevice: (deviceId: string) => void
  addParticipant: (participant: VoiceParticipant) => void
  removeParticipant: (userId: string) => void
  clearParticipants: () => void

  // Video actions
  toggleCamera: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  setVideoDevice: (deviceId: string) => void
  setVideoLayoutMode: (mode: VideoLayoutMode) => void
  setFocusedParticipant: (participantId: string | null) => void
  togglePiP: () => void
  setVideoQuality: (quality: VideoQuality) => void
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

  // Video state
  isCameraEnabled: false,
  isScreenSharing: false,
  selectedVideoDeviceId: localStorage.getItem('voice:videoDeviceId'),
  videoLayoutMode: 'grid',
  focusedParticipantId: null,
  isPiPActive: false,
  videoQuality: 'auto',
  localTrackVersion: 0,

  joinVoiceChannel: async (serverId, channelId) => {
    const { room: existingRoom } = get()
    if (existingRoom) {
      get().leaveVoiceChannel()
    }

    const { token, room: roomName } = await voice.getToken(serverId, channelId)
    const livekitUrl = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'

    const room = new Room()

    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      set((state) => ({
        participants: [
          ...state.participants,
          {
            userId: participant.identity,
            username: participant.name || participant.identity,
            muted: false,
            deafened: false,
            cameraEnabled: false,
            screenShareEnabled: false,
            videoTrack: null,
            screenTrack: null
          }
        ]
      }))
      soundService.playJoinSound()
    })

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      set((state) => ({
        participants: state.participants.filter((p) => p.userId !== participant.identity)
      }))
      soundService.playLeaveSound()
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

    // Attach remote audio tracks to DOM so they play
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        track.attach()
        return
      }
      if (track.kind !== Track.Kind.Video) return
      const isScreenShare = track.source === Track.Source.ScreenShare
      set((state) => ({
        participants: state.participants.map((p) =>
          p.userId === participant.identity
            ? isScreenShare
              ? { ...p, screenShareEnabled: true, screenTrack: track }
              : { ...p, cameraEnabled: true, videoTrack: track }
            : p
        ),
        // Auto-focus screen shares
        ...(isScreenShare ? { focusedParticipantId: participant.identity, videoLayoutMode: 'focus' as VideoLayoutMode } : {})
      }))
    })

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        track.detach()
        return
      }
      if (track.kind !== Track.Kind.Video) return
      const isScreenShare = track.source === Track.Source.ScreenShare
      set((state) => {
        const updates: Partial<VoiceState> = {
          participants: state.participants.map((p) =>
            p.userId === participant.identity
              ? isScreenShare
                ? { ...p, screenShareEnabled: false, screenTrack: null }
                : { ...p, cameraEnabled: false, videoTrack: null }
              : p
          )
        }
        // Clear focus if the screen-sharer stopped sharing
        if (isScreenShare && state.focusedParticipantId === participant.identity) {
          updates.focusedParticipantId = null
          updates.videoLayoutMode = 'grid'
        }
        return updates
      })
    })

    // Bump localTrackVersion when local tracks are published/unpublished
    // so VideoGrid re-reads tracks from the room object
    room.on(RoomEvent.LocalTrackPublished, () => {
      set((state) => ({ localTrackVersion: state.localTrackVersion + 1 }))
    })
    room.on(RoomEvent.LocalTrackUnpublished, () => {
      set((state) => ({ localTrackVersion: state.localTrackVersion + 1 }))
    })

    await room.connect(livekitUrl, token)

    // Resume audio playback — required in production (HTTPS) due to browser
    // autoplay policy. localhost is exempt, which is why dev works without this.
    await room.startAudio()

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
    ).map((p) => {
      let videoTrack: Track | null = null
      let screenTrack: Track | null = null
      let cameraEnabled = false
      let screenShareEnabled = false

      p.videoTrackPublications.forEach((pub) => {
        if (pub.track) {
          if (pub.track.source === Track.Source.ScreenShare) {
            screenTrack = pub.track
            screenShareEnabled = true
          } else {
            videoTrack = pub.track
            cameraEnabled = true
          }
        }
      })

      return {
        userId: p.identity,
        username: p.name || p.identity,
        muted: !p.isMicrophoneEnabled,
        deafened: false,
        cameraEnabled,
        screenShareEnabled,
        videoTrack,
        screenTrack
      }
    })

    set({
      room,
      activeChannelId: channelId,
      activeServerId: serverId,
      participants: existingParticipants,
      isMuted: false,
      isDeafened: false,
      isCameraEnabled: false,
      isScreenSharing: false
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
      speakingUserIds: [],
      isCameraEnabled: false,
      isScreenSharing: false,
      focusedParticipantId: null,
      isPiPActive: false
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

  clearParticipants: () => set({ participants: [] }),

  // Video actions
  toggleCamera: async () => {
    const { room, isCameraEnabled, selectedVideoDeviceId } = get()
    if (!room) return
    const enabling = !isCameraEnabled
    // Set state immediately to avoid race with event handlers
    set({ isCameraEnabled: enabling })
    try {
      await room.localParticipant.setCameraEnabled(
        enabling,
        selectedVideoDeviceId ? { deviceId: selectedVideoDeviceId } : undefined
      )
    } catch {
      // Revert on failure
      set({ isCameraEnabled: !enabling })
    }
  },

  toggleScreenShare: async () => {
    const { room, isScreenSharing } = get()
    if (!room) return
    const enabling = !isScreenSharing
    set({ isScreenSharing: enabling })
    try {
      await room.localParticipant.setScreenShareEnabled(enabling)
    } catch {
      // User cancelled the screen share picker or error — revert
      set({ isScreenSharing: !enabling })
    }
  },

  setVideoDevice: (deviceId) => {
    localStorage.setItem('voice:videoDeviceId', deviceId)
    set({ selectedVideoDeviceId: deviceId })
    const { room, isCameraEnabled } = get()
    if (room && isCameraEnabled) {
      room.switchActiveDevice('videoinput', deviceId)
    }
  },

  setVideoLayoutMode: (mode) => set({ videoLayoutMode: mode }),

  setFocusedParticipant: (participantId) => set({ focusedParticipantId: participantId }),

  togglePiP: () => set((state) => ({ isPiPActive: !state.isPiPActive })),

  setVideoQuality: (quality) => set({ videoQuality: quality })
}))
