import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to test the module internals, so we import everything after setting up mocks
let apiModule: typeof import('../api')

// Track fetch calls
let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function blobResponse(status = 200) {
  return new Response(new Blob(['data']), { status })
}

describe('api.ts – 401 interceptor & TokenManager', () => {
  let refreshHandler: ReturnType<typeof vi.fn>
  let failureHandler: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    // Re-import to get fresh module state
    vi.resetModules()
    apiModule = await import('../api')

    refreshHandler = vi.fn()
    failureHandler = vi.fn()
    apiModule.setOAuthRefreshHandler(refreshHandler)
    apiModule.setAuthFailureHandler(failureHandler)
    apiModule.setTokens('access-tok', 'refresh-tok')
  })

  afterEach(() => {
    apiModule.clearTokens()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('should retry request after successful 401 refresh', async () => {
    refreshHandler.mockResolvedValue(true)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: '1', username: 'test' }))

    const result = await apiModule.auth.me()
    expect(result).toEqual({ id: '1', username: 'test' })
    expect(refreshHandler).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(failureHandler).not.toHaveBeenCalled()
  })

  it('should deduplicate concurrent refresh calls', async () => {
    let resolveRefresh!: (v: boolean) => void
    refreshHandler.mockImplementation(() => new Promise<boolean>(r => { resolveRefresh = r }))
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))

    // Launch 3 concurrent requests that will all hit 401
    const p1 = apiModule.auth.me().catch(() => 'failed')
    const p2 = apiModule.auth.me().catch(() => 'failed')
    const p3 = apiModule.auth.me().catch(() => 'failed')

    // Let microtasks settle so all 3 reach the refresh path
    await vi.advanceTimersByTimeAsync(0)

    // Resolve the shared refresh — it should fail so all 3 throw
    resolveRefresh(false)
    await Promise.all([p1, p2, p3])

    // Only 1 refresh call despite 3 concurrent 401s
    expect(refreshHandler).toHaveBeenCalledTimes(1)
  })

  it('should call authFailureHandler when refresh fails', async () => {
    refreshHandler.mockResolvedValue(false)
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))

    await apiModule.auth.me().catch(() => {})

    expect(failureHandler).toHaveBeenCalledTimes(1)
  })

  it('should NOT call authFailureHandler when suppressed', async () => {
    refreshHandler.mockResolvedValue(false)
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))

    apiModule.tokenManager.suppressAuthFailure()
    await apiModule.auth.me().catch(() => {})
    apiModule.tokenManager.restoreAuthFailure()

    expect(failureHandler).not.toHaveBeenCalled()
  })

  it('should not retry after a retry-401 (no infinite loop)', async () => {
    refreshHandler.mockResolvedValue(true)
    // Both calls return 401
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))

    await apiModule.auth.me().catch(() => {})

    // First call + one retry = 2 total fetches, no more
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // refresh called once for the first 401, not for the retry 401
    expect(refreshHandler).toHaveBeenCalledTimes(1)
  })

  it('should retry requestBlob (export) on 401', async () => {
    refreshHandler.mockResolvedValue(true)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(blobResponse())

    const result = await apiModule.exports.channelMessages('ch1', 'json')
    expect(result.constructor.name).toBe('Blob')
    expect(refreshHandler).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('should schedule proactive refresh', async () => {
    refreshHandler.mockResolvedValue(true)

    const nowSec = Math.floor(Date.now() / 1000)
    apiModule.setTokens('tok', 'ref', nowSec + 120) // expires in 120s

    // Advance 59s — should not have called refresh yet
    await vi.advanceTimersByTimeAsync(59_000)
    expect(refreshHandler).not.toHaveBeenCalled()

    // Advance to 60s (= 120 - 60 margin) — should trigger
    await vi.advanceTimersByTimeAsync(1_000)
    expect(refreshHandler).toHaveBeenCalledTimes(1)
  })

  it('should cancel proactive refresh on clearTokens', async () => {
    refreshHandler.mockResolvedValue(true)

    const nowSec = Math.floor(Date.now() / 1000)
    apiModule.setTokens('tok', 'ref', nowSec + 120)

    // Clear before the timer fires
    apiModule.clearTokens()

    await vi.advanceTimersByTimeAsync(120_000)
    expect(refreshHandler).not.toHaveBeenCalled()
  })

  it('should retry requestMultipart on 401', async () => {
    refreshHandler.mockResolvedValue(true)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: 'emoji1', name: 'test' }))

    // Use emojis.create which goes through requestMultipart
    const file = new File(['img'], 'test.png', { type: 'image/png' })
    const result = await apiModule.emojis.create('srv1', 'test', file)
    expect(result).toEqual({ id: 'emoji1', name: 'test' })
    expect(refreshHandler).toHaveBeenCalledTimes(1)
  })
})
