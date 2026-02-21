import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { useServerFolderStore } from '@/stores/serverFolderStore'
import { useAuthStore } from '@/stores/authStore'
import UserAvatar from '@/components/common/UserAvatar'
import ProfileModal from '@/components/profile/ProfileModal'
import type { Server } from '@/types/models'

const SettingsOverlay = lazy(() => import('@/components/settings/SettingsOverlay'))

// Stable empty set to avoid re-renders
const EMPTY_SET = new Set<string>()

function ServerIcon({ server, isActive, onClick }: { server: Server; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200
        ${
          isActive
            ? 'bg-sol-amber/20 rounded-xl text-sol-amber shadow-glow-amber'
            : 'bg-sol-bg-secondary text-sol-text-secondary hover:bg-sol-amber/10 hover:rounded-xl hover:text-sol-amber'
        }`}
      title={server.name}
    >
      <span className="font-display text-sm font-bold">
        {server.name.charAt(0).toUpperCase()}
      </span>
    </button>
  )
}

export default function ServerSidebar() {
  const { servers, activeServerId, setActiveServer, createServer, joinServer } = useServerStore()
  const isDiscoverOpen = useServerStore((s) => s.isDiscoverOpen)
  const { user } = useAuthStore()
  const folders = useServerFolderStore((s) => s.folders)
  const fetchFolders = useServerFolderStore((s) => s.fetchFolders)
  const addServerToFolder = useServerFolderStore((s) => s.addServerToFolder)
  const removeServerFromFolder = useServerFolderStore((s) => s.removeServerFromFolder)
  const deleteFolderAction = useServerFolderStore((s) => s.deleteFolder)
  const createFolderAction = useServerFolderStore((s) => s.createFolder)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [newServerName, setNewServerName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(EMPTY_SET)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'server' | 'folder'; id: string } | null>(null)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState('#b58900')
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchFolders()
  }, [fetchFolders])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  // Build a set of server IDs that are inside folders
  const folderedServerIds = useMemo(() => {
    const ids = new Set<string>()
    for (const folder of folders) {
      for (const sid of folder.server_ids) {
        ids.add(sid)
      }
    }
    return ids
  }, [folders])

  // Servers not in any folder
  const unfolderedServers = useMemo(
    () => servers.filter((s) => !folderedServerIds.has(s.id)),
    [servers, folderedServerIds]
  )

  // Map server IDs to server objects for quick lookup
  const serverMap = useMemo(() => {
    const map = new Map<string, Server>()
    for (const s of servers) {
      map.set(s.id, s)
    }
    return map
  }, [servers])

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newServerName.trim()) return
    const server = await createServer(newServerName.trim())
    setActiveServer(server.id)
    setNewServerName('')
    setShowCreate(false)
  }

  const handleJoinServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    await joinServer(inviteCode.trim())
    setInviteCode('')
    setShowJoin(false)
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    await createFolderAction(newFolderName.trim(), newFolderColor)
    setNewFolderName('')
    setNewFolderColor('#b58900')
    setShowCreateFolder(false)
  }

  const handleContextMenu = (e: React.MouseEvent, type: 'server' | 'folder', id: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type, id })
  }

  const handleDeleteFolder = async (folderId: string) => {
    setContextMenu(null)
    await deleteFolderAction(folderId)
  }

  const handleMoveToFolder = async (serverId: string, folderId: string) => {
    setContextMenu(null)
    // Remove from any existing folder first
    for (const folder of folders) {
      if (folder.server_ids.includes(serverId)) {
        await removeServerFromFolder(folder.id, serverId)
      }
    }
    await addServerToFolder(folderId, serverId)
  }

  const handleRemoveFromFolder = async (serverId: string) => {
    setContextMenu(null)
    for (const folder of folders) {
      if (folder.server_ids.includes(serverId)) {
        await removeServerFromFolder(folder.id, serverId)
      }
    }
  }

  return (
    <nav role="navigation" aria-label="Servers" className="w-[72px] bg-sol-bg flex flex-col items-center py-3 gap-2 border-r border-sol-bg-elevated">
      {/* Home button */}
      <button
        onClick={() => useServerStore.getState().setActiveServerNull()}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200
          ${!activeServerId
            ? 'bg-sol-amber/20 rounded-xl text-sol-amber shadow-glow-amber'
            : 'bg-sol-bg-secondary text-sol-text-secondary hover:bg-sol-amber/20 hover:rounded-xl hover:text-sol-amber'
          }`}
        title="Direct Messages"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </button>

      <div className="w-8 h-px bg-sol-bg-elevated" />

      {/* Folders */}
      {folders.map((folder) => {
        const isCollapsed = collapsedFolders.has(folder.id)
        const folderServers = folder.server_ids
          .map((sid) => serverMap.get(sid))
          .filter((s): s is Server => s !== undefined)

        // If collapsed, show a stacked icon
        if (isCollapsed) {
          return (
            <div key={folder.id} className="relative" onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}>
              <button
                onClick={() => toggleFolder(folder.id)}
                className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center transition-all duration-200 hover:rounded-xl relative"
                title={`${folder.name} (${folderServers.length} servers)`}
                style={{ borderLeft: folder.color ? `3px solid ${folder.color}` : undefined }}
              >
                <div className="flex flex-col items-center gap-0.5">
                  {folderServers.length > 0 ? (
                    <div className="grid grid-cols-2 gap-0.5 w-8 h-8 place-items-center">
                      {folderServers.slice(0, 4).map((s) => (
                        <span key={s.id} className="text-[8px] font-display font-bold text-sol-text-secondary w-3.5 h-3.5 flex items-center justify-center rounded bg-sol-bg/50">
                          {s.name.charAt(0).toUpperCase()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                  )}
                </div>
              </button>
              <span className="text-[9px] text-sol-text-muted text-center w-full block truncate mt-0.5 px-1">{folder.name}</span>
            </div>
          )
        }

        // Expanded: show folder header + server icons
        return (
          <div key={folder.id} className="flex flex-col items-center gap-1" onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}>
            <button
              onClick={() => toggleFolder(folder.id)}
              className="w-12 h-6 rounded flex items-center justify-center transition-all duration-200 hover:bg-sol-bg-secondary"
              title={folder.name}
              style={{ borderLeft: folder.color ? `3px solid ${folder.color}` : undefined }}
            >
              <span className="text-[9px] text-sol-text-muted truncate px-1">{folder.name}</span>
            </button>
            {folderServers.map((server) => (
              <div key={server.id} onContextMenu={(e) => { e.stopPropagation(); handleContextMenu(e, 'server', server.id) }}>
                <ServerIcon
                  server={server}
                  isActive={activeServerId === server.id}
                  onClick={() => setActiveServer(server.id)}
                />
              </div>
            ))}
            <div className="w-6 h-px bg-sol-bg-elevated" />
          </div>
        )
      })}

      {/* Unfoldered servers */}
      {unfolderedServers.map((server) => (
        <div key={server.id} onContextMenu={(e) => handleContextMenu(e, 'server', server.id)}>
          <ServerIcon
            server={server}
            isActive={activeServerId === server.id}
            onClick={() => setActiveServer(server.id)}
          />
        </div>
      ))}

      {/* Add server */}
      <button
        onClick={() => setShowCreate(true)}
        className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center
                   hover:bg-sol-green/20 hover:rounded-xl transition-all duration-200
                   text-sol-green/50 hover:text-sol-green"
        title="Create Server"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </button>

      {/* Join server */}
      <button
        onClick={() => setShowJoin(true)}
        className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center
                   hover:bg-sol-sage/20 hover:rounded-xl transition-all duration-200
                   text-sol-sage/50 hover:text-sol-sage"
        title="Join Server"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 10l-4-4m4 4l-4 4m4-4H3" />
        </svg>
      </button>

      {/* Create folder */}
      <button
        onClick={() => setShowCreateFolder(true)}
        className="w-12 h-12 rounded-2xl bg-sol-bg-secondary flex items-center justify-center
                   hover:bg-sol-violet/20 hover:rounded-xl transition-all duration-200
                   text-sol-violet/50 hover:text-sol-violet"
        title="Create Folder"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </button>

      {/* Discover servers */}
      <button
        onClick={() => {
          useServerStore.getState().setActiveServerNull()
          useServerStore.getState().setDiscoverOpen(true)
        }}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center
                   hover:bg-sol-cyan/20 hover:rounded-xl transition-all duration-200
                   ${isDiscoverOpen
                     ? 'bg-sol-cyan/20 rounded-xl text-sol-cyan'
                     : 'bg-sol-bg-secondary text-sol-cyan/50 hover:text-sol-cyan'
                   }`}
        title="Discover Servers"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Settings gear */}
      <button
        onClick={() => setShowSettings(true)}
        className="w-10 h-10 rounded-full flex items-center justify-center
                   text-sol-text-muted hover:text-sol-text-primary hover:bg-sol-bg-secondary
                   transition-all duration-200"
        title="User Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>

      {/* User avatar / profile */}
      <button
        onClick={() => setShowProfile(true)}
        className="hover:opacity-80 transition-opacity"
        title={user?.username}
      >
        <UserAvatar avatarUrl={user?.avatar_url} username={user?.username} size="md" />
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-sol-bg-secondary border border-sol-bg-elevated rounded-lg py-1 shadow-lg z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === 'folder' && (
            <button
              onClick={() => handleDeleteFolder(contextMenu.id)}
              className="w-full px-3 py-1.5 text-left text-sm text-sol-red hover:bg-sol-bg-elevated"
            >
              Delete Folder
            </button>
          )}
          {contextMenu.type === 'server' && (
            <>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleMoveToFolder(contextMenu.id, folder.id)}
                  className="w-full px-3 py-1.5 text-left text-sm text-sol-text-primary hover:bg-sol-bg-elevated flex items-center gap-2"
                >
                  {folder.color && (
                    <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: folder.color }} />
                  )}
                  Move to {folder.name}
                </button>
              ))}
              {/* Check if server is in a folder to show remove option */}
              {folders.some((f) => f.server_ids.includes(contextMenu.id)) && (
                <button
                  onClick={() => handleRemoveFromFolder(contextMenu.id)}
                  className="w-full px-3 py-1.5 text-left text-sm text-sol-text-secondary hover:bg-sol-bg-elevated"
                >
                  Remove from Folder
                </button>
              )}
              {folders.length === 0 && (
                <div className="px-3 py-1.5 text-sm text-sol-text-muted">
                  No folders yet
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Create server modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <form
            onSubmit={handleCreateServer}
            onClick={(e) => e.stopPropagation()}
            className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
            role="dialog"
            aria-modal="true"
            aria-label="Create server"
          >
            <h3 className="font-display text-lg text-sol-amber mb-4">Create Server</h3>
            <input
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              className="input-field mb-4"
              placeholder="Server name"
              autoFocus
              required
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-danger">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile modal */}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}

      {/* Join server modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowJoin(false)}>
          <form
            onSubmit={handleJoinServer}
            onClick={(e) => e.stopPropagation()}
            className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
            role="dialog"
            aria-modal="true"
            aria-label="Join server"
          >
            <h3 className="font-display text-lg text-sol-amber mb-4">Join Server</h3>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="input-field mb-4"
              placeholder="Invite code"
              autoFocus
              required
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowJoin(false)} className="btn-danger">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Join
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create folder modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreateFolder(false)}>
          <form
            onSubmit={handleCreateFolder}
            onClick={(e) => e.stopPropagation()}
            className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-6 w-96 animate-grow-in"
          >
            <h3 className="font-display text-lg text-sol-amber mb-4">Create Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="input-field mb-4"
              placeholder="Folder name"
              autoFocus
              required
            />
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-sol-text-secondary">Color</label>
              <input
                type="color"
                value={newFolderColor}
                onChange={(e) => setNewFolderColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-sol-bg-elevated bg-transparent"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreateFolder(false)} className="btn-danger">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settings overlay */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsOverlay onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
    </nav>
  )
}
