/**
 * IndexedDB-backed key storage for E2EE identity keys.
 * Uses non-extractable CryptoKey objects where possible to prevent
 * XSS from exfiltrating raw key material.
 */

const DB_NAME = 'thicket-e2ee'
const DB_VERSION = 1
const STORE_NAME = 'keys'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

export async function getStoredKey(key: string): Promise<CryptoKeyPair | CryptoKey | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function storeKey(key: string, value: CryptoKeyPair | CryptoKey | JsonWebKey): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function deleteKey(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function clearAllKeys(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get or generate a unique device ID for this browser session.
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('thicket-device-id')
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem('thicket-device-id', deviceId)
  }
  return deviceId
}
