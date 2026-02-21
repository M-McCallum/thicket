/**
 * Per-file AES-256-GCM encryption for DM file attachments.
 * Each file gets its own random AES key. The file key is included
 * in the encrypted message content so only message recipients can decrypt.
 */

export interface EncryptedFileMetadata {
  attachment_id: string
  key: string         // base64 AES key
  iv: string          // base64 IV
  original_filename: string
  content_type: string
}

/**
 * Encrypt a file's contents with a random AES-256-GCM key.
 * Returns the encrypted blob and the key metadata to embed in the message.
 */
export async function encryptFile(
  file: File
): Promise<{ encryptedBlob: Blob; metadata: Omit<EncryptedFileMetadata, 'attachment_id'> }> {
  // Generate a random per-file key
  const fileKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — we need to embed it in the message
    ['encrypt', 'decrypt']
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = await file.arrayBuffer()

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    fileKey,
    plaintext
  )

  // Export key for embedding in message
  const rawKey = await crypto.subtle.exportKey('raw', fileKey)

  return {
    encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
    metadata: {
      key: arrayBufferToBase64(new Uint8Array(rawKey)),
      iv: arrayBufferToBase64(iv),
      original_filename: file.name,
      content_type: file.type || 'application/octet-stream',
    },
  }
}

/**
 * Decrypt an encrypted file using the key metadata from the message.
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  metadata: EncryptedFileMetadata
): Promise<Blob> {
  const rawKey = base64ToArrayBuffer(metadata.key)
  const iv = base64ToArrayBuffer(metadata.iv)

  const key = await crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encryptedData
  )

  return new Blob([decrypted], { type: metadata.content_type })
}

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
