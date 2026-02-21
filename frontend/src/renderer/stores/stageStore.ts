import { create } from 'zustand'
import { stage as stageApi } from '@renderer/services/api'
import type { StageInstance, StageSpeaker, StageHandRaise } from '@renderer/types/models'

interface StageState {
  instance: StageInstance | null
  speakers: StageSpeaker[]
  handRaises: StageHandRaise[]
  loading: boolean

  fetchStageInfo: (channelId: string) => Promise<void>
  startStage: (channelId: string, topic: string) => Promise<void>
  endStage: (channelId: string) => Promise<void>
  addSpeaker: (channelId: string) => Promise<void>
  removeSpeaker: (channelId: string, userId: string) => Promise<void>
  raiseHand: (channelId: string) => Promise<void>
  lowerHand: (channelId: string) => Promise<void>
  inviteToSpeak: (channelId: string, userId: string) => Promise<void>

  // WS event handlers
  handleStageStart: (instance: StageInstance) => void
  handleStageEnd: (channelId: string) => void
  handleSpeakerAdd: (channelId: string, userId: string, invited: boolean) => void
  handleSpeakerRemove: (channelId: string, userId: string) => void
  handleHandRaise: (channelId: string, userId: string) => void
  handleHandLower: (channelId: string, userId: string) => void
  clearStage: () => void
}

export const useStageStore = create<StageState>((set, get) => ({
  instance: null,
  speakers: [],
  handRaises: [],
  loading: false,

  fetchStageInfo: async (channelId: string) => {
    set({ loading: true })
    try {
      const info = await stageApi.getInfo(channelId)
      set({
        instance: info.instance,
        speakers: info.speakers,
        handRaises: info.hand_raises,
        loading: false
      })
    } catch {
      set({ loading: false })
    }
  },

  startStage: async (channelId: string, topic: string) => {
    const instance = await stageApi.start(channelId, topic)
    set({ instance, speakers: [{ channel_id: channelId, user_id: instance.started_by, invited: false, added_at: instance.started_at }], handRaises: [] })
  },

  endStage: async (channelId: string) => {
    await stageApi.end(channelId)
    set({ instance: null, speakers: [], handRaises: [] })
  },

  addSpeaker: async (channelId: string) => {
    await stageApi.addSpeaker(channelId)
  },

  removeSpeaker: async (channelId: string, userId: string) => {
    await stageApi.removeSpeaker(channelId, userId)
  },

  raiseHand: async (channelId: string) => {
    await stageApi.raiseHand(channelId)
  },

  lowerHand: async (channelId: string) => {
    await stageApi.lowerHand(channelId)
  },

  inviteToSpeak: async (channelId: string, userId: string) => {
    await stageApi.inviteToSpeak(channelId, userId)
  },

  handleStageStart: (instance: StageInstance) => {
    const { instance: current } = get()
    if (current && current.channel_id !== instance.channel_id) return
    set({
      instance,
      speakers: [{ channel_id: instance.channel_id, user_id: instance.started_by, invited: false, added_at: instance.started_at }],
      handRaises: []
    })
  },

  handleStageEnd: (channelId: string) => {
    const { instance } = get()
    if (instance && instance.channel_id === channelId) {
      set({ instance: null, speakers: [], handRaises: [] })
    }
  },

  handleSpeakerAdd: (channelId: string, userId: string, invited: boolean) => {
    const { instance } = get()
    if (!instance || instance.channel_id !== channelId) return
    set((state) => {
      if (state.speakers.some((s) => s.user_id === userId)) return state
      return {
        speakers: [...state.speakers, { channel_id: channelId, user_id: userId, invited, added_at: new Date().toISOString() }],
        handRaises: state.handRaises.filter((h) => h.user_id !== userId)
      }
    })
  },

  handleSpeakerRemove: (channelId: string, userId: string) => {
    const { instance } = get()
    if (!instance || instance.channel_id !== channelId) return
    set((state) => ({
      speakers: state.speakers.filter((s) => s.user_id !== userId)
    }))
  },

  handleHandRaise: (channelId: string, userId: string) => {
    const { instance } = get()
    if (!instance || instance.channel_id !== channelId) return
    set((state) => {
      if (state.handRaises.some((h) => h.user_id === userId)) return state
      return {
        handRaises: [...state.handRaises, { channel_id: channelId, user_id: userId, raised_at: new Date().toISOString() }]
      }
    })
  },

  handleHandLower: (channelId: string, userId: string) => {
    const { instance } = get()
    if (!instance || instance.channel_id !== channelId) return
    set((state) => ({
      handRaises: state.handRaises.filter((h) => h.user_id !== userId)
    }))
  },

  clearStage: () => {
    set({ instance: null, speakers: [], handRaises: [], loading: false })
  }
}))
