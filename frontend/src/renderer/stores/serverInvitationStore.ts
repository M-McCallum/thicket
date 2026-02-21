import { create } from 'zustand'
import type { ServerInvitationWithDetails } from '@renderer/types/models'
import { serverInvitations } from '@renderer/services/api'

interface ServerInvitationState {
  receivedInvitations: ServerInvitationWithDetails[]
  isLoading: boolean

  fetchReceived: () => Promise<void>
  acceptInvitation: (id: string) => Promise<void>
  declineInvitation: (id: string) => Promise<void>
  addReceivedInvitation: (inv: ServerInvitationWithDetails) => void
  removeInvitation: (id: string) => void
}

export const useServerInvitationStore = create<ServerInvitationState>((set) => ({
  receivedInvitations: [],
  isLoading: false,

  fetchReceived: async () => {
    set({ isLoading: true })
    try {
      const invitations = await serverInvitations.received()
      set({ receivedInvitations: invitations, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  acceptInvitation: async (id) => {
    await serverInvitations.accept(id)
    set((state) => ({
      receivedInvitations: state.receivedInvitations.filter((i) => i.id !== id)
    }))
  },

  declineInvitation: async (id) => {
    await serverInvitations.decline(id)
    set((state) => ({
      receivedInvitations: state.receivedInvitations.filter((i) => i.id !== id)
    }))
  },

  addReceivedInvitation: (inv) =>
    set((state) => ({
      receivedInvitations: state.receivedInvitations.some((i) => i.id === inv.id)
        ? state.receivedInvitations
        : [inv, ...state.receivedInvitations]
    })),

  removeInvitation: (id) =>
    set((state) => ({
      receivedInvitations: state.receivedInvitations.filter((i) => i.id !== id)
    }))
}))
