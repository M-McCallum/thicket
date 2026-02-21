/**
 * AES-256-GCM message encryption/decryption with envelope wrapping.
 * Wire format: {"v":1,"alg":"AES-256-GCM","iv":"<base64>","ct":"<base64>"}
 */

export interface EncryptedEnvelope {
  v: 1
  alg: 'AES-256-GCM'
  iv: string  // base64
  ct: string  // base64
}

/**
 * Encrypt a plaintext message using AES-256-GCM.
 * Returns the serialized envelope string.
 */
export async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: 'AES-256-GCM',
    iv: arrayBufferToBase64(iv),
    ct: arrayBufferToBase64(new Uint8Array(ciphertext)),
  }

  return JSON.stringify(envelope)
}

/**
 * Decrypt an encrypted envelope string back to plaintext.
 */
export async function decryptMessage(key: CryptoKey, envelopeStr: string): Promise<string> {
  const envelope: EncryptedEnvelope = JSON.parse(envelopeStr)

  if (envelope.v !== 1 || envelope.alg !== 'AES-256-GCM') {
    throw new Error(`Unsupported envelope version/algorithm: v${envelope.v} ${envelope.alg}`)
  }

  const iv = base64ToArrayBuffer(envelope.iv)
  const ciphertext = base64ToArrayBuffer(envelope.ct)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  )

  return new TextDecoder().decode(decrypted)
}

/**
 * Check if a message content string is an encrypted envelope.
 */
export function isEncryptedEnvelope(content: string): boolean {
  return content.startsWith('{"v":1,')
}

// Base64 encoding utilities (browser-safe, no external deps)

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
