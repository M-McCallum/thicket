import { create } from 'zustand'
import type { Friendship } from '@renderer/types/models'
import { friends as friendsApi } from '@renderer/services/api'

// Stable empty set to avoid selector infinite loops (see Zustand gotcha in MEMORY.md)
const emptySet = new Set<string>()

interface FriendState {
  friends: Friendship[]
  pendingRequests: Friendship[]
  blockedUserIds: Set<string>
  isLoading: boolean

  fetchFriends: () => Promise<void>
  fetchRequests: () => Promise<void>
  fetchBlockedUsers: () => Promise<void>
  sendRequest: (username: string) => Promise<void>
  acceptRequest: (id: string) => Promise<void>
  declineRequest: (id: string) => Promise<void>
  removeFriend: (id: string) => Promise<void>
  blockUser: (userId: string) => Promise<void>
  unblockUser: (userId: string) => Promise<void>
  isBlocked: (userId: string) => boolean
  addFriendRequest: (request: Friendship) => void
  movePendingToFriends: (friendshipId: string, friendship: Friendship) => void
  removeFriendById: (userId: string) => void
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  blockedUserIds: emptySet,
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

  fetchBlockedUsers: async () => {
    try {
      const ids = await friendsApi.blocked()
      set({ blockedUserIds: new Set(ids) })
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

  blockUser: async (userId) => {
    await friendsApi.block(userId)
    set((state) => {
      const next = new Set(state.blockedUserIds)
      next.add(userId)
      return {
        blockedUserIds: next,
        // Also remove from friends list if present
        friends: state.friends.filter(
          (f) => f.requester_id !== userId && f.addressee_id !== userId
        )
      }
    })
  },

  unblockUser: async (userId) => {
    await friendsApi.unblock(userId)
    set((state) => {
      const next = new Set(state.blockedUserIds)
      next.delete(userId)
      return { blockedUserIds: next }
    })
  },

  isBlocked: (userId) => get().blockedUserIds.has(userId),

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
