import { create } from 'zustand'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error'

interface UpdateState {
  status: UpdateStatus
  version: string | null
  percent: number
  errorMessage: string | null
  dismissed: boolean

  checkForUpdates: () => void
  downloadUpdate: () => void
  installUpdate: () => void
  dismiss: () => void
  initUpdater: () => () => void
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: 'idle',
  version: null,
  percent: 0,
  errorMessage: null,
  dismissed: false,

  checkForUpdates: () => {
    window.api?.updater?.checkForUpdates()
  },

  downloadUpdate: () => {
    set({ dismissed: false })
    window.api?.updater?.downloadUpdate()
  },

  installUpdate: () => {
    window.api?.updater?.installUpdate()
  },

  dismiss: () => {
    set({ dismissed: true })
  },

  initUpdater: () => {
    if (!window.api?.updater?.onStatus) return () => {}

    const unsubscribe = window.api.updater.onStatus((data) => {
      const status = data.status as UpdateStatus
      switch (status) {
        case 'checking':
          set({ status: 'checking', dismissed: false })
          break
        case 'available':
          set({ status: 'available', version: data.version as string, dismissed: false })
          break
        case 'up-to-date':
          set({ status: 'up-to-date' })
          break
        case 'downloading':
          set({ status: 'downloading', percent: data.percent as number })
          break
        case 'ready':
          set({ status: 'ready', dismissed: false })
          break
        case 'error':
          set({ status: 'error', errorMessage: data.errorMessage as string, dismissed: false })
          break
      }
    })

    return unsubscribe
  }
}))
