/**
 * ECDH P-256 identity key pair generation and management.
 * Each browser session generates its own key pair.
 * Private keys are stored as non-extractable CryptoKey objects in IndexedDB.
 */

import { getStoredKey, storeKey, getDeviceId } from './keyStore'

const IDENTITY_KEY_STORE = 'identity-keypair'

const ECDH_PARAMS: EcKeyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
}

/**
 * Generate a new ECDH P-256 key pair. The private key is non-extractable.
 */
export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    ECDH_PARAMS,
    false, // non-extractable — JS can't read the private key bytes
    ['deriveKey', 'deriveBits']
  )
  await storeKey(IDENTITY_KEY_STORE, keyPair)
  return keyPair
}

/**
 * Get the stored identity key pair, or generate a new one.
 */
export async function getOrCreateIdentityKeyPair(): Promise<CryptoKeyPair> {
  const stored = await getStoredKey(IDENTITY_KEY_STORE) as CryptoKeyPair | null
  if (stored?.privateKey && stored?.publicKey) {
    return stored
  }
  return generateIdentityKeyPair()
}

/**
 * Export the public key as JWK for uploading to the server.
 */
export async function exportPublicKeyJWK(keyPair: CryptoKeyPair): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', keyPair.publicKey)
}

/**
 * Import a public key from JWK (received from server for another user's device).
 */
export async function importPublicKeyJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    ECDH_PARAMS,
    true,
    [] // public keys don't need usages for ECDH
  )
}

/**
 * Register the current device's public key with the server.
 */
export async function registerDeviceKey(
  uploadFn: (deviceId: string, publicKeyJWK: JsonWebKey) => Promise<void>
): Promise<CryptoKeyPair> {
  const keyPair = await getOrCreateIdentityKeyPair()
  const publicJWK = await exportPublicKeyJWK(keyPair)
  const deviceId = getDeviceId()
  await uploadFn(deviceId, publicJWK)
  return keyPair
}
