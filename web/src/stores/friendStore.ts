import { create } from 'zustand'
import type { Friendship } from '@/types/models'
import { friends as friendsApi } from '@/services/api'

interface FriendState {
  friends: Friendship[]
  pendingRequests: Friendship[]
  isLoading: boolean

  fetchFriends: () => Promise<void>
  fetchRequests: () => Promise<void>
  sendRequest: (username: string) => Promise<void>
  acceptRequest: (id: string) => Promise<void>
  declineRequest: (id: string) => Promise<void>
  removeFriend: (id: string) => Promise<void>
  addFriendRequest: (request: Friendship) => void
  movePendingToFriends: (friendshipId: string, friendship: Friendship) => void
  removeFriendById: (userId: string) => void
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  isLoading: false,

  fetchFriends: async () => {
    set({ isLoading: true })
    try {
      const friends = await friendsApi.list()
      set({ friends, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchRequests: async () => {
    try {
      const pendingRequests = await friendsApi.requests()
      set({ pendingRequests })
    } catch {
      // ignore
    }
  },

  sendRequest: async (username) => {
    await friendsApi.sendRequest(username)
  },

  acceptRequest: async (id) => {
    await friendsApi.accept(id)
    const req = get().pendingRequests.find((r) => r.id === id)
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.id !== id),
      friends: req ? [...state.friends, { ...req, status: 'accepted' as const }] : state.friends
    }))
  },

  declineRequest: async (id) => {
    await friendsApi.decline(id)
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.id !== id)
    }))
  },

  removeFriend: async (id) => {
    await friendsApi.remove(id)
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== id)
    }))
  },

  addFriendRequest: (request) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.some((r) => r.id === request.id)
        ? state.pendingRequests
        : [request, ...state.pendingRequests]
    })),

  movePendingToFriends: (friendshipId, friendship) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.id !== friendshipId),
      friends: [...state.friends, friendship]
    })),

  removeFriendById: (userId) =>
    set((state) => ({
      friends: state.friends.filter(
        (f) => f.requester_id !== userId && f.addressee_id !== userId
      )
    }))
}))
