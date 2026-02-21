import { uploads } from './api'

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024 // 10 MB
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB
const MAX_RETRIES = 3

export interface UploadProgress {
  filename: string
  totalBytes: number
  uploadedBytes: number
  status: 'uploading' | 'completing' | 'done' | 'error' | 'cancelled'
  error?: string
}

export function isLargeFile(file: File): boolean {
  return file.size > LARGE_FILE_THRESHOLD
}

export function isFileTooLarge(file: File): boolean {
  return file.size > MAX_FILE_SIZE
}

export async function uploadLargeFile(
  file: File,
  onProgress: (p: UploadProgress) => void,
  signal: AbortSignal
): Promise<{ pendingUploadId: string }> {
  const progress: UploadProgress = {
    filename: file.name,
    totalBytes: file.size,
    uploadedBytes: 0,
    status: 'uploading'
  }

  onProgress({ ...progress })

  // Initiate the multipart upload
  const { pending_upload_id, part_urls, part_size } = await uploads.initiate(
    file.name,
    file.type || 'application/octet-stream',
    file.size
  )

  // Upload each chunk directly to MinIO via presigned PUT URLs
  for (let i = 0; i < part_urls.length; i++) {
    if (signal.aborted) {
      progress.status = 'cancelled'
      onProgress({ ...progress })
      await uploads.abort(pending_upload_id).catch(() => {})
      throw new DOMException('Upload cancelled', 'AbortError')
    }

    const start = i * part_size
    const end = Math.min(start + part_size, file.size)
    const blob = file.slice(start, end)

    let etag: string | null = null
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (signal.aborted) {
        progress.status = 'cancelled'
        onProgress({ ...progress })
        await uploads.abort(pending_upload_id).catch(() => {})
        throw new DOMException('Upload cancelled', 'AbortError')
      }

      try {
        const response = await fetch(part_urls[i], {
          method: 'PUT',
          body: blob,
          signal
        })

        if (!response.ok) {
          throw new Error(`Part upload failed with status ${response.status}`)
        }

        etag = response.headers.get('ETag')
        lastError = null
        break
      } catch (err) {
        if (signal.aborted) {
          progress.status = 'cancelled'
          onProgress({ ...progress })
          await uploads.abort(pending_upload_id).catch(() => {})
          throw new DOMException('Upload cancelled', 'AbortError')
        }
        lastError = err as Error
      }
    }

    if (lastError || !etag) {
      progress.status = 'error'
      progress.error = lastError?.message || 'Failed to upload part'
      onProgress({ ...progress })
      await uploads.abort(pending_upload_id).catch(() => {})
      throw lastError || new Error('Failed to upload part: no ETag')
    }

    // Report part completion to backend
    await uploads.reportPart(pending_upload_id, i + 1, etag)

    progress.uploadedBytes = end
    onProgress({ ...progress })
  }

  progress.status = 'completing'
  onProgress({ ...progress })

  return { pendingUploadId: pending_upload_id }
}

export async function finalizeUpload(
  pendingUploadId: string,
  messageId?: string,
  dmMessageId?: string
) {
  return uploads.complete(pendingUploadId, messageId, dmMessageId)
}

export async function abortUpload(pendingUploadId: string): Promise<void> {
  await uploads.abort(pendingUploadId)
}
