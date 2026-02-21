import { create } from 'zustand'
import { Room, RoomEvent, Track, RemoteParticipant, Participant, RemoteTrackPublication, RemoteTrack, AudioPresets } from 'livekit-client'
import { voice } from '@/services/api'
import { wsService } from '@/services/ws'
import { soundService } from '@/services/soundService'

export type VideoLayoutMode = 'grid' | 'focus'
export type VideoQuality = '1080p' | '720p' | '480p' | '360p'
export type ScreenShareQuality = '1080p_30' | '1080p_15' | '720p_30' | '4k_15'
export type InputMode = 'voice_activity' | 'push_to_talk'

const VIDEO_RESOLUTIONS: Record<VideoQuality, { width: number; height: number; frameRate: number }> = {
  '1080p': { width: 1920, height: 1080, frameRate: 30 },
  '720p': { width: 1280, height: 720, frameRate: 30 },
  '480p': { width: 854, height: 480, frameRate: 30 },
  '360p': { width: 640, height: 360, frameRate: 24 },
}

const SCREEN_SHARE_RESOLUTIONS: Record<ScreenShareQuality, { width: number; height: number; frameRate: number }> = {
  '4k_15': { width: 3840, height: 2160, frameRate: 15 },
  '1080p_30': { width: 1920, height: 1080, frameRate: 30 },
  '1080p_15': { width: 1920, height: 1080, frameRate: 15 },
  '720p_30': { width: 1280, height: 720, frameRate: 30 },
}

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
  focusedTileKey: string | null
  isPiPActive: boolean
  videoQuality: VideoQuality
  screenShareQuality: ScreenShareQuality
  localTrackVersion: number

  // Voice settings
  inputMode: InputMode
  pushToTalkKey: string
  perUserVolume: Record<string, number>
  noiseSuppression: boolean
  isPTTActive: boolean

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
  setFocusedParticipant: (tileKey: string | null) => void
  togglePiP: () => void
  setVideoQuality: (quality: VideoQuality) => Promise<void>
  setScreenShareQuality: (quality: ScreenShareQuality) => void

  // Voice settings actions
  setInputMode: (mode: InputMode) => void
  setPushToTalkKey: (key: string) => void
  setPerUserVolume: (userId: string, volume: number) => void
  setNoiseSuppression: (enabled: boolean) => void
  setPTTActive: (active: boolean) => void
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
  focusedTileKey: null,
  isPiPActive: false,
  videoQuality: (localStorage.getItem('voice:videoQuality') as VideoQuality) || '720p',
  screenShareQuality: (localStorage.getItem('voice:screenShareQuality') as ScreenShareQuality) || '1080p_30',
  localTrackVersion: 0,

  // Voice settings
  inputMode: (localStorage.getItem('voice:inputMode') as InputMode) || 'voice_activity',
  pushToTalkKey: localStorage.getItem('voice:pushToTalkKey') || 'Space',
  perUserVolume: {},
  noiseSuppression: localStorage.getItem('voice:noiseSuppression') !== 'false',
  isPTTActive: false,

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
        const el = track.attach()
        // Apply per-user volume if set
        const vol = get().perUserVolume[participant.identity]
        if (vol !== undefined && el instanceof HTMLMediaElement) {
          el.volume = Math.min(vol / 100, 1)
        }
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
        ...(isScreenShare ? { focusedTileKey: `${participant.identity}-screen`, videoLayoutMode: 'focus' as VideoLayoutMode } : {})
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
        if (isScreenShare && state.focusedTileKey === `${participant.identity}-screen`) {
          updates.focusedTileKey = null
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

    const { inputMode, noiseSuppression } = get()
    const isPTT = inputMode === 'push_to_talk'

    // Enable microphone with saved device preference and noise suppression
    const savedInputId = get().selectedInputDeviceId
    const micOptions: Record<string, unknown> = {}
    if (savedInputId) micOptions.deviceId = savedInputId
    if (noiseSuppression) micOptions.noiseSuppression = true

    await room.localParticipant.setMicrophoneEnabled(
      true,
      Object.keys(micOptions).length > 0 ? micOptions : undefined,
      { audioPreset: AudioPresets.musicHighQualityStereo },
    )

    // For PTT mode: mute immediately after enabling mic (so the track is published but muted)
    if (isPTT) {
      await room.localParticipant.setMicrophoneEnabled(false)
    }

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
      isMuted: isPTT,
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
      focusedTileKey: null,
      isPiPActive: false,
      isPTTActive: false
    })
  },

  toggleMute: () => {
    const { room, isMuted, inputMode } = get()
    if (room) {
      // In PTT mode, toggleMute switches back to voice activity
      if (inputMode === 'push_to_talk') return
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
    const { room, isCameraEnabled, selectedVideoDeviceId, videoQuality } = get()
    if (!room) return
    const enabling = !isCameraEnabled
    set({ isCameraEnabled: enabling })
    try {
      const resolution = VIDEO_RESOLUTIONS[videoQuality]
      await room.localParticipant.setCameraEnabled(enabling, {
        ...(selectedVideoDeviceId ? { deviceId: selectedVideoDeviceId } : {}),
        resolution,
      })
    } catch {
      set({ isCameraEnabled: !enabling })
    }
  },

  toggleScreenShare: async () => {
    const { room, isScreenSharing, screenShareQuality } = get()
    if (!room) return
    const enabling = !isScreenSharing
    set({ isScreenSharing: enabling })
    const ssRes = SCREEN_SHARE_RESOLUTIONS[screenShareQuality]
    try {
      await room.localParticipant.setScreenShareEnabled(enabling, {
        resolution: ssRes,
      })
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

  setScreenShareQuality: (quality) => {
    localStorage.setItem('voice:screenShareQuality', quality)
    set({ screenShareQuality: quality })
  },

  setFocusedParticipant: (tileKey) => set({ focusedTileKey: tileKey }),

  togglePiP: () => set((state) => ({ isPiPActive: !state.isPiPActive })),

  setVideoQuality: async (quality) => {
    localStorage.setItem('voice:videoQuality', quality)
    set({ videoQuality: quality })
    const { room, isCameraEnabled, selectedVideoDeviceId } = get()
    if (room && isCameraEnabled) {
      const resolution = VIDEO_RESOLUTIONS[quality]
      await room.localParticipant.setCameraEnabled(false)
      await room.localParticipant.setCameraEnabled(true, {
        ...(selectedVideoDeviceId ? { deviceId: selectedVideoDeviceId } : {}),
        resolution,
      })
    }
  },

  // Voice settings actions
  setInputMode: (mode) => {
    localStorage.setItem('voice:inputMode', mode)
    set({ inputMode: mode })
    const { room } = get()
    if (room) {
      if (mode === 'push_to_talk') {
        // Mute mic when switching to PTT
        room.localParticipant.setMicrophoneEnabled(false)
        set({ isMuted: true, isPTTActive: false })
      } else {
        // Unmute mic when switching to voice activity
        room.localParticipant.setMicrophoneEnabled(true)
        set({ isMuted: false, isPTTActive: false })
      }
    }
  },

  setPushToTalkKey: (key) => {
    localStorage.setItem('voice:pushToTalkKey', key)
    set({ pushToTalkKey: key })
  },

  setPerUserVolume: (userId, volume) => {
    set((state) => ({
      perUserVolume: { ...state.perUserVolume, [userId]: volume }
    }))
    // Apply volume to existing audio elements
    const { room } = get()
    if (room) {
      const participant = room.remoteParticipants.get(userId)
      if (participant) {
        participant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            const elements = pub.track.attachedElements
            elements.forEach((el) => {
              if (el instanceof HTMLMediaElement) {
                el.volume = Math.min(volume / 100, 1)
              }
            })
          }
        })
      }
    }
  },

  setNoiseSuppression: (enabled) => {
    localStorage.setItem('voice:noiseSuppression', String(enabled))
    set({ noiseSuppression: enabled })
  },

  setPTTActive: (active) => {
    const { room, inputMode } = get()
    if (inputMode !== 'push_to_talk' || !room) return
    set({ isPTTActive: active, isMuted: !active })
    room.localParticipant.setMicrophoneEnabled(active)
  }
}))
