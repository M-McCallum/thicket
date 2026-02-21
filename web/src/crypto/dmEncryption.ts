/**
 * ECDH shared secret derivation + HKDF for per-DM AES-256 keys.
 * For 1:1 DMs: Derives a shared AES key from ECDH between sender and recipient.
 * For group DMs: Uses a distributed symmetric key (see groupKeyDistribution).
 */

import { importPublicKeyJWK } from './identityKeys'
import { getStoredKey, storeKey } from './keyStore'

/**
 * Derive an AES-256-GCM key from an ECDH shared secret using HKDF.
 * The info string includes both user IDs (sorted) to ensure both sides derive the same key.
 */
export async function deriveSharedDMKey(
  myPrivateKey: CryptoKey,
  theirPublicKeyJWK: JsonWebKey,
  myUserId: string,
  theirUserId: string
): Promise<CryptoKey> {
  const theirPublicKey = await importPublicKeyJWK(theirPublicKeyJWK)

  // ECDH key agreement
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    256
  )

  // Import shared bits as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    'HKDF',
    false,
    ['deriveKey']
  )

  // Sort user IDs to ensure both sides derive the same key
  const sortedIds = [myUserId, theirUserId].sort().join(':')
  const info = new TextEncoder().encode(`thicket-dm:${sortedIds}`)

  // Derive AES-256-GCM key via HKDF
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // zero salt is fine — ECDH output has enough entropy
      info,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for HKDF voice key derivation
    ['encrypt', 'decrypt']
  )
}

/**
 * Cache key for a DM conversation's derived AES key.
 */
function dmKeyStoreKey(conversationId: string): string {
  return `dm-key:${conversationId}`
}

/**
 * Get a cached DM encryption key, or derive and cache a new one.
 */
export async function getOrDeriveDMKey(
  conversationId: string,
  myPrivateKey: CryptoKey,
  theirPublicKeyJWK: JsonWebKey,
  myUserId: string,
  theirUserId: string
): Promise<CryptoKey> {
  const cached = await getStoredKey(dmKeyStoreKey(conversationId)) as CryptoKey | null
  if (cached) return cached

  const key = await deriveSharedDMKey(myPrivateKey, theirPublicKeyJWK, myUserId, theirUserId)
  await storeKey(dmKeyStoreKey(conversationId), key)
  return key
}

/**
 * Store a group DM symmetric key (received via key distribution).
 */
export async function storeGroupDMKey(conversationId: string, epoch: number, key: CryptoKey): Promise<void> {
  await storeKey(`dm-group-key:${conversationId}:${epoch}`, key)
}

/**
 * Retrieve a group DM symmetric key for a specific epoch.
 */
export async function getGroupDMKey(conversationId: string, epoch: number): Promise<CryptoKey | null> {
  return getStoredKey(`dm-group-key:${conversationId}:${epoch}`) as Promise<CryptoKey | null>
}

/**
 * Derive a voice/video encryption key from a conversation key.
 * Uses HKDF with "voice" context to create a separate key for media encryption.
 */
export async function deriveVoiceKey(dmKey: CryptoKey): Promise<Uint8Array> {
  // Export the AES key to raw bytes for HKDF
  const rawKey = await crypto.subtle.exportKey('raw', dmKey)

  const hkdfKey = await crypto.subtle.importKey('raw', rawKey, 'HKDF', false, ['deriveBits'])

  const voiceBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('thicket-voice'),
    },
    hkdfKey,
    256
  )

  return new Uint8Array(voiceBits)
}
