import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isLargeFile, isFileTooLarge, uploadLargeFile, finalizeUpload, abortUpload } from '../uploadService'

// Mock the api module
vi.mock('../api', () => ({
  uploads: {
    initiate: vi.fn(),
    reportPart: vi.fn(),
    complete: vi.fn(),
    abort: vi.fn()
  }
}))

import { uploads } from '../api'

const mockedUploads = uploads as unknown as {
  initiate: ReturnType<typeof vi.fn>
  reportPart: ReturnType<typeof vi.fn>
  complete: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
}

function createMockFile(size: number, name = 'test.bin', type = 'application/octet-stream'): File {
  const blob = new Blob([new ArrayBuffer(size)], { type })
  return new File([blob], name, { type })
}

describe('isLargeFile', () => {
  it('returns true for files > 10MB', () => {
    const file = createMockFile(11 * 1024 * 1024)
    expect(isLargeFile(file)).toBe(true)
  })

  it('returns false for files <= 10MB', () => {
    const file = createMockFile(10 * 1024 * 1024)
    expect(isLargeFile(file)).toBe(false)
  })
})

describe('isFileTooLarge', () => {
  it('returns true for files > 500MB', () => {
    const file = createMockFile(501 * 1024 * 1024)
    expect(isFileTooLarge(file)).toBe(true)
  })

  it('returns false for files <= 500MB', () => {
    const file = createMockFile(500 * 1024 * 1024)
    expect(isFileTooLarge(file)).toBe(false)
  })
})

describe('uploadLargeFile', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('initiates and uploads all parts', async () => {
    const file = createMockFile(25 * 1024 * 1024, 'video.mp4', 'video/mp4')
    const partSize = 10 * 1024 * 1024

    mockedUploads.initiate.mockResolvedValue({
      pending_upload_id: 'pending-123',
      part_urls: [
        'https://minio/part1',
        'https://minio/part2',
        'https://minio/part3'
      ],
      part_size: partSize
    })

    mockedUploads.reportPart.mockResolvedValue(undefined)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ ETag: '"etag-test"' })
    })

    const onProgress = vi.fn()
    const controller = new AbortController()

    const result = await uploadLargeFile(file, onProgress, controller.signal)

    expect(result.pendingUploadId).toBe('pending-123')
    expect(mockedUploads.initiate).toHaveBeenCalledWith('video.mp4', 'video/mp4', file.size)
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    expect(mockedUploads.reportPart).toHaveBeenCalledTimes(3)
    expect(mockedUploads.reportPart).toHaveBeenCalledWith('pending-123', 1, '"etag-test"')
  })

  it('reports progress correctly', async () => {
    const fileSize = 20 * 1024 * 1024
    const file = createMockFile(fileSize)
    const partSize = 10 * 1024 * 1024

    mockedUploads.initiate.mockResolvedValue({
      pending_upload_id: 'pending-prog',
      part_urls: ['https://minio/p1', 'https://minio/p2'],
      part_size: partSize
    })
    mockedUploads.reportPart.mockResolvedValue(undefined)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ ETag: '"e"' })
    })

    const progressUpdates: number[] = []
    const onProgress = vi.fn().mockImplementation((p) => {
      progressUpdates.push(p.uploadedBytes)
    })

    await uploadLargeFile(file, onProgress, new AbortController().signal)

    // Should have progress updates for each part completion
    expect(progressUpdates).toContain(partSize)
    expect(progressUpdates).toContain(fileSize)
  })

  it('retries failed chunks up to 3 times', async () => {
    const file = createMockFile(11 * 1024 * 1024)

    mockedUploads.initiate.mockResolvedValue({
      pending_upload_id: 'pending-retry',
      part_urls: ['https://minio/p1', 'https://minio/p2'],
      part_size: 10 * 1024 * 1024
    })
    mockedUploads.reportPart.mockResolvedValue(undefined)

    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      // First 2 calls fail, 3rd succeeds, then all subsequent succeed
      if (callCount <= 2) {
        throw new Error('network error')
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ ETag: '"e"' })
      })
    })

    await uploadLargeFile(file, vi.fn(), new AbortController().signal)

    // Part 1: 2 failures + 1 success = 3 calls; Part 2: 1 call
    expect(globalThis.fetch).toHaveBeenCalledTimes(4)
  })

  it('aborts on signal', async () => {
    const file = createMockFile(30 * 1024 * 1024)
    const controller = new AbortController()

    mockedUploads.initiate.mockResolvedValue({
      pending_upload_id: 'pending-abort',
      part_urls: ['https://minio/p1', 'https://minio/p2', 'https://minio/p3'],
      part_size: 10 * 1024 * 1024
    })
    mockedUploads.reportPart.mockResolvedValue(undefined)
    mockedUploads.abort.mockResolvedValue(undefined)

    let partsDone = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      partsDone++
      if (partsDone === 2) {
        controller.abort()
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ ETag: '"e"' })
      })
    })

    await expect(
      uploadLargeFile(file, vi.fn(), controller.signal)
    ).rejects.toThrow()
  })

  it('throws after 3 retries exhausted', async () => {
    const file = createMockFile(11 * 1024 * 1024)

    mockedUploads.initiate.mockResolvedValue({
      pending_upload_id: 'pending-fail',
      part_urls: ['https://minio/p1'],
      part_size: 10 * 1024 * 1024
    })
    mockedUploads.abort.mockResolvedValue(undefined)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    await expect(
      uploadLargeFile(file, vi.fn(), new AbortController().signal)
    ).rejects.toThrow('network error')

    expect(mockedUploads.abort).toHaveBeenCalledWith('pending-fail')
  })
})

describe('finalizeUpload', () => {
  it('calls complete endpoint', async () => {
    mockedUploads.complete.mockResolvedValue({ id: 'att-1' })

    await finalizeUpload('pending-123', 'msg-456')

    expect(mockedUploads.complete).toHaveBeenCalledWith('pending-123', 'msg-456', undefined)
  })
})

describe('abortUpload', () => {
  it('calls abort endpoint', async () => {
    mockedUploads.abort.mockResolvedValue(undefined)

    await abortUpload('pending-789')

    expect(mockedUploads.abort).toHaveBeenCalledWith('pending-789')
  })
})
