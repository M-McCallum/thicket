/**
 * E2EE state management. Handles key lifecycle, encryption/decryption,
 * and coordination with the DM store.
 */
import { create } from 'zustand'
import {
  getOrCreateIdentityKeyPair,
  exportPublicKeyJWK,
  getDeviceId,
  encryptMessage,
  decryptMessage,
  isEncryptedEnvelope,
  wrapIdentityKey,
  unwrapIdentityKey,
  getOrDeriveDMKey,
} from '@renderer/crypto'
import { keys as keysApi } from '@renderer/services/api'

interface E2EEState {
  initialized: boolean
  identityKeyPair: CryptoKeyPair | null

  // Per-conversation decrypted key cache (in-memory only)
  dmKeys: Map<string, CryptoKey>

  // Actions
  initialize: () => Promise<void>
  encrypt: (conversationId: string, plaintext: string) => Promise<string>
  decrypt: (conversationId: string, ciphertext: string) => Promise<string>
  isEncrypted: (content: string) => boolean
  getDMKey: (conversationId: string, theirPublicKeyJWK: JsonWebKey, myUserId: string, theirUserId: string) => Promise<CryptoKey>

  // Key recovery
  createRecoveryEnvelope: (passphrase: string) => Promise<void>
  recoverFromPassphrase: (passphrase: string) => Promise<void>

  // Key verification
  getVerificationEmoji: (conversationId: string, theirPublicKeyJWK: JsonWebKey, myUserId: string, theirUserId: string) => Promise<string[]>
}

// Stable emoji set for key verification (WhatsApp-style)
const VERIFICATION_EMOJIS = [
  'dog', 'cat', 'fish', 'bear', 'bird',
  'tree', 'star', 'moon', 'sun', 'fire',
  'wave', 'key', 'lock', 'bell', 'gem',
  'bolt', 'leaf', 'rose', 'dice', 'note',
  'flag', 'gear', 'lamp', 'book', 'pen',
  'cup', 'ring', 'mail', 'gift', 'chip',
  'atom', 'link',
]

export const useE2EEStore = create<E2EEState>((set, get) => ({
  initialized: false,
  identityKeyPair: null,
  dmKeys: new Map(),

  initialize: async () => {
    if (get().initialized) return

    try {
      const keyPair = await getOrCreateIdentityKeyPair()
      const publicJWK = await exportPublicKeyJWK(keyPair)
      const deviceId = getDeviceId()

      // Register with server
      await keysApi.registerIdentityKey(deviceId, publicJWK)

      set({ identityKeyPair: keyPair, initialized: true })
    } catch (err) {
      console.error('[E2EE] Failed to initialize:', err)
    }
  },

  getDMKey: async (conversationId, theirPublicKeyJWK, myUserId, theirUserId) => {
    const cached = get().dmKeys.get(conversationId)
    if (cached) return cached

    const { identityKeyPair } = get()
    if (!identityKeyPair) throw new Error('E2EE not initialized')

    const key = await getOrDeriveDMKey(
      conversationId,
      identityKeyPair.privateKey,
      theirPublicKeyJWK,
      myUserId,
      theirUserId
    )

    set((s) => {
      const newMap = new Map(s.dmKeys)
      newMap.set(conversationId, key)
      return { dmKeys: newMap }
    })

    return key
  },

  encrypt: async (conversationId, plaintext) => {
    const key = get().dmKeys.get(conversationId)
    if (!key) throw new Error(`No encryption key for conversation ${conversationId}`)
    return encryptMessage(key, plaintext)
  },

  decrypt: async (conversationId, ciphertext) => {
    const key = get().dmKeys.get(conversationId)
    if (!key) {
      // Return raw ciphertext if we don't have the key yet
      return '[Encrypted message - key not available]'
    }
    try {
      return await decryptMessage(key, ciphertext)
    } catch {
      return '[Unable to decrypt message]'
    }
  },

  isEncrypted: (content) => isEncryptedEnvelope(content),

  createRecoveryEnvelope: async (passphrase) => {
    const { identityKeyPair } = get()
    if (!identityKeyPair) throw new Error('E2EE not initialized')

    const envelope = await wrapIdentityKey(identityKeyPair.privateKey, passphrase)
    await keysApi.storeEnvelope(Array.from(envelope))
  },

  recoverFromPassphrase: async (passphrase) => {
    const envelopeResp = await keysApi.getEnvelope()
    const envelopeBytes = new Uint8Array(envelopeResp.envelope)
    const privateKey = await unwrapIdentityKey(envelopeBytes, passphrase)

    // Re-generate public key from the private key by creating a new pair
    // and replacing the private key. Unfortunately Web Crypto doesn't let
    // us derive the public key from a private key directly, so we re-register.
    const keyPair = await getOrCreateIdentityKeyPair()
    // Store the recovered private key in a new pair structure
    const recoveredPair: CryptoKeyPair = {
      privateKey,
      publicKey: keyPair.publicKey,
    }

    set({ identityKeyPair: recoveredPair, initialized: true })
  },

  getVerificationEmoji: async (_conversationId, theirPublicKeyJWK, myUserId, theirUserId) => {
    const { identityKeyPair } = get()
    if (!identityKeyPair) return []

    // Hash the combined public keys + user IDs to generate verification emojis
    const myPublicJWK = await exportPublicKeyJWK(identityKeyPair)
    const sortedIds = [myUserId, theirUserId].sort()
    const data = JSON.stringify({
      keys: [myPublicJWK, theirPublicKeyJWK].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b))
      ),
      users: sortedIds,
    })

    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    const bytes = new Uint8Array(hash)

    // Pick 7 emojis from the hash
    const emojis: string[] = []
    for (let i = 0; i < 7; i++) {
      emojis.push(VERIFICATION_EMOJIS[bytes[i] % VERIFICATION_EMOJIS.length])
    }
    return emojis
  },
}))
