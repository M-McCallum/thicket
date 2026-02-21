import { create } from 'zustand'

interface LayoutState {
  sidebarOpen: boolean
  memberListOpen: boolean
  toggleSidebar: () => void
  toggleMemberList: () => void
  closeAll: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: false,
  memberListOpen: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarOpen: !s.sidebarOpen, memberListOpen: false })),
  toggleMemberList: () =>
    set((s) => ({ memberListOpen: !s.memberListOpen, sidebarOpen: false })),
  closeAll: () => set({ sidebarOpen: false, memberListOpen: false }),
}))
