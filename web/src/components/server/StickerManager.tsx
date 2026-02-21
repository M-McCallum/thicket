import { useState, useEffect, useRef } from 'react'
import type { StickerPack, Sticker } from '@/types/models'
import { stickers as stickersApi, resolveAttachmentUrl } from '@/services/api'

interface StickerManagerProps {
  serverId: string
  onClose: () => void
}

export default function StickerManager({ serverId, onClose }: StickerManagerProps) {
  const [packs, setPacks] = useState<StickerPack[]>([])
  const [activePackId, setActivePackId] = useState<string | null>(null)
  const [stickerList, setStickerList] = useState<Sticker[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Create pack
  const [showCreatePack, setShowCreatePack] = useState(false)
  const [newPackName, setNewPackName] = useState('')
  const [newPackDesc, setNewPackDesc] = useState('')

  // Upload sticker
  const [stickerName, setStickerName] = useState('')
  const [stickerFile, setStickerFile] = useState<File | null>(null)
  const [stickerPreview, setStickerPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPacks()
  }, [serverId])

  useEffect(() => {
    if (!activePackId) return
    setIsLoading(true)
    stickersApi.getStickers(activePackId)
      .then(setStickerList)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [activePackId])

  const loadPacks = async () => {
    try {
      const p = await stickersApi.getPacks()
      // Filter to packs that belong to this server
      const serverPacks = p.filter((pk) => pk.server_id === serverId)
      setPacks(serverPacks)
      if (serverPacks.length > 0 && !activePackId) {
        setActivePackId(serverPacks[0].id)
      }
    } catch {
      // ignore
    }
  }

  const handleCreatePack = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPackName.trim()) return
    setError('')
    try {
      const pack = await stickersApi.createPack(serverId, newPackName.trim(), newPackDesc.trim() || undefined)
      setPacks((prev) => [...prev, pack])
      setActivePackId(pack.id)
      setNewPackName('')
      setNewPackDesc('')
      setShowCreatePack(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pack')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStickerFile(file)
    setStickerPreview(URL.createObjectURL(file))
    if (!stickerName) {
      setStickerName(file.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleUploadSticker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activePackId || !stickerFile || !stickerName.trim()) return
    setUploading(true)
    setError('')
    try {
      const sticker = await stickersApi.createSticker(activePackId, stickerName.trim(), stickerFile)
      setStickerList((prev) => [...prev, sticker])
      setStickerName('')
      setStickerFile(null)
      setStickerPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload sticker')
    }
    setUploading(false)
  }

  const handleDeleteSticker = async (id: string) => {
    try {
      await stickersApi.delete(id)
      setStickerList((prev) => prev.filter((s) => s.id !== id))
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl w-[480px] max-h-[80vh] flex flex-col animate-grow-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sol-bg-elevated">
          <h3 className="font-display text-lg text-sol-amber">Sticker Packs</h3>
          <button onClick={onClose} className="text-sol-text-muted hover:text-sol-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Pack tabs + create button */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {packs.map((pack) => (
              <button
                key={pack.id}
                onClick={() => setActivePackId(pack.id)}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  activePackId === pack.id
                    ? 'bg-sol-amber/20 text-sol-amber'
                    : 'text-sol-text-secondary bg-sol-bg hover:bg-sol-bg-elevated'
                }`}
              >
                {pack.name}
              </button>
            ))}
            <button
              onClick={() => setShowCreatePack(true)}
              className="px-3 py-1.5 text-sm rounded-lg text-sol-sage bg-sol-sage/10 hover:bg-sol-sage/20 transition-colors"
            >
              + New Pack
            </button>
          </div>

          {/* Create pack form */}
          {showCreatePack && (
            <form onSubmit={handleCreatePack} className="mb-4 p-4 bg-sol-bg rounded-lg border border-sol-bg-elevated">
              <input
                type="text"
                value={newPackName}
                onChange={(e) => setNewPackName(e.target.value)}
                placeholder="Pack name"
                className="input-field mb-2"
                autoFocus
                required
              />
              <input
                type="text"
                value={newPackDesc}
                onChange={(e) => setNewPackDesc(e.target.value)}
                placeholder="Description (optional)"
                className="input-field mb-3"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreatePack(false)} className="btn-danger text-sm">
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-sm">
                  Create
                </button>
              </div>
            </form>
          )}

          {/* Sticker grid */}
          {activePackId && (
            <>
              {isLoading ? (
                <div className="text-center text-sol-text-muted text-sm py-8">Loading...</div>
              ) : stickerList.length === 0 ? (
                <div className="text-center text-sol-text-muted text-sm py-8">
                  No stickers yet. Upload one below.
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {stickerList.map((sticker) => (
                    <div key={sticker.id} className="relative group">
                      <img
                        src={resolveAttachmentUrl(sticker.url)}
                        alt={sticker.name}
                        className="w-full aspect-square object-contain rounded-lg bg-sol-bg p-1"
                      />
                      <button
                        onClick={() => handleDeleteSticker(sticker.id)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-sol-coral rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete"
                      >
                        x
                      </button>
                      <div className="text-xs text-sol-text-muted text-center truncate mt-0.5">{sticker.name}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload sticker form */}
              <form onSubmit={handleUploadSticker} className="p-4 bg-sol-bg rounded-lg border border-sol-bg-elevated">
                <h4 className="text-sm font-medium text-sol-text-primary mb-3">Upload Sticker</h4>
                <div className="flex gap-3">
                  {/* Preview / file picker */}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-sol-bg-elevated hover:border-sol-amber/30 flex items-center justify-center transition-colors shrink-0 overflow-hidden"
                  >
                    {stickerPreview ? (
                      <img src={stickerPreview} alt="Preview" className="w-full h-full object-contain" />
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-text-muted">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    )}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={stickerName}
                      onChange={(e) => setStickerName(e.target.value)}
                      placeholder="Sticker name"
                      className="input-field mb-2"
                      required
                    />
                    <button
                      type="submit"
                      disabled={!stickerFile || !stickerName.trim() || uploading}
                      className="btn-primary text-sm w-full"
                    >
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}

          {error && <p className="text-sol-coral text-sm mt-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}
