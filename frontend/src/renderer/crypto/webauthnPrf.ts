/**
 * WebAuthn PRF extension for hardware-bound key derivation.
 * Progressive enhancement — only offered to users with compatible passkeys.
 *
 * When enabled, the PRF-derived key wraps the IndexedDB-cached identity key,
 * so XSS cannot access it without physical authenticator interaction.
 *
 * Browser support: Chrome 116+, Safari 18+, Firefox 139+ (check at runtime).
 */

/**
 * Check if the browser supports the WebAuthn PRF extension.
 */
export function isPRFSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function'
  )
}

/**
 * Derive a hardware-bound wrapping key using the PRF extension.
 * Returns an AES-256-GCM key derived from the PRF output.
 */
export async function derivePRFKey(credentialId: ArrayBuffer): Promise<CryptoKey | null> {
  if (!isPRFSupported()) return null

  const salt = new TextEncoder().encode('thicket-e2ee-prf-v1')

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{
          id: credentialId,
          type: 'public-key',
        }],
        extensions: {
          prf: {
            eval: {
              first: salt,
            },
          },
        },
      },
    }) as PublicKeyCredential | null

    if (!assertion) return null

    const prfResult = (assertion.getClientExtensionResults() as Record<string, unknown> & { prf?: { results?: { first?: ArrayBuffer } } })?.prf?.results?.first
    if (!prfResult) return null

    // Import PRF output as HKDF key material
    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      prfResult,
      'HKDF',
      false,
      ['deriveKey']
    )

    // Derive AES-256-GCM wrapping key
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('thicket-prf-wrapping-key'),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    )
  } catch {
    // PRF not supported by this credential or browser
    return null
  }
}
