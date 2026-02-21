import { create } from 'zustand'
import { serverFolders } from '@/services/api'
import type { ServerFolder } from '@/types/models'

interface ServerFolderState {
  folders: ServerFolder[]
  fetchFolders: () => Promise<void>
  createFolder: (name: string, color: string) => Promise<ServerFolder>
  updateFolder: (id: string, data: { name?: string; color?: string; position?: number }) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  addServerToFolder: (folderId: string, serverId: string) => Promise<void>
  removeServerFromFolder: (folderId: string, serverId: string) => Promise<void>
}

export const useServerFolderStore = create<ServerFolderState>((set, get) => ({
  folders: [],

  fetchFolders: async () => {
    try {
      const folders = await serverFolders.list()
      set({ folders })
    } catch {
      // Silently fail if endpoint not available
    }
  },

  createFolder: async (name, color) => {
    const folder = await serverFolders.create(name, color)
    set({ folders: [...get().folders, folder] })
    return folder
  },

  updateFolder: async (id, data) => {
    await serverFolders.update(id, data)
    set({
      folders: get().folders.map((f) =>
        f.id === id ? { ...f, ...data } : f
      ),
    })
  },

  deleteFolder: async (id) => {
    await serverFolders.delete(id)
    set({ folders: get().folders.filter((f) => f.id !== id) })
  },

  addServerToFolder: async (folderId, serverId) => {
    await serverFolders.addServer(folderId, serverId)
    set({
      folders: get().folders.map((f) =>
        f.id === folderId
          ? { ...f, server_ids: [...f.server_ids, serverId] }
          : f
      ),
    })
  },

  removeServerFromFolder: async (folderId, serverId) => {
    await serverFolders.removeServer(folderId, serverId)
    set({
      folders: get().folders.map((f) =>
        f.id === folderId
          ? { ...f, server_ids: f.server_ids.filter((sid) => sid !== serverId) }
          : f
      ),
    })
  },
}))
