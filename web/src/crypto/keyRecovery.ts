/**
 * Key recovery via PBKDF2 + AES-GCM (v1 fallback).
 * Wraps/unwraps the E2EE identity private key using a user-provided recovery passphrase.
 *
 * Future: Replace with OPAQUE (RFC 9807) for server-blind key recovery.
 * With OPAQUE, the server never sees the passphrase — only an OPRF output.
 * The PBKDF2 approach here still requires trusting the server won't log passwords.
 */

const PBKDF2_ITERATIONS = 600_000 // OWASP recommendation for SHA-256

interface WrappedKeyEnvelope {
  v: 1
  salt: string  // base64
  iv: string    // base64
  ct: string    // base64 (the wrapped identity private key)
}

/**
 * Derive a wrapping key from a passphrase using PBKDF2.
 */
async function deriveWrappingKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

/**
 * Wrap (encrypt) an identity private key with a passphrase.
 * Returns the envelope as bytes for server storage.
 */
export async function wrapIdentityKey(
  identityPrivateKey: CryptoKey,
  passphrase: string
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveWrappingKey(passphrase, salt)

  const wrappedKey = await crypto.subtle.wrapKey(
    'jwk',
    identityPrivateKey,
    wrappingKey,
    { name: 'AES-GCM', iv }
  )

  const envelope: WrappedKeyEnvelope = {
    v: 1,
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    ct: arrayBufferToBase64(new Uint8Array(wrappedKey)),
  }

  return new TextEncoder().encode(JSON.stringify(envelope))
}

/**
 * Unwrap (decrypt) an identity private key using the recovery passphrase.
 */
export async function unwrapIdentityKey(
  envelopeBytes: Uint8Array,
  passphrase: string
): Promise<CryptoKey> {
  const envelope: WrappedKeyEnvelope = JSON.parse(
    new TextDecoder().decode(envelopeBytes)
  )

  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`)
  }

  const salt = base64ToArrayBuffer(envelope.salt)
  const iv = base64ToArrayBuffer(envelope.iv)
  const wrappedKey = base64ToArrayBuffer(envelope.ct)
  const wrappingKey = await deriveWrappingKey(passphrase, salt)

  return crypto.subtle.unwrapKey(
    'jwk',
    wrappedKey.buffer as ArrayBuffer,
    wrappingKey,
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // non-extractable
    ['deriveKey', 'deriveBits']
  )
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
