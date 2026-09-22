const encoder = new TextEncoder()
export interface EncryptedSecret { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; wrappedDek: Uint8Array<ArrayBuffer>; keyVersion: number }
const aad = (id: string, purpose: string) => encoder.encode(`ideagap:vault:v1:${id}:${purpose}`)

export async function importMasterKey(base64: string) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(base64)) throw new Error("Invalid vault key configuration")
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  try { return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]) }
  finally { bytes.fill(0) }
}
async function wrap(id: string, raw: Uint8Array<ArrayBuffer>, master: CryptoKey, version: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(id, `dek:${version}`) }, master, raw))
  const packed = new Uint8Array(iv.length + encrypted.length)
  packed.set(iv); packed.set(encrypted, iv.length)
  return packed
}
async function unwrap(id: string, packed: Uint8Array<ArrayBuffer>, master: CryptoKey, version: number) {
  if (packed.length !== 60) throw new Error("Invalid envelope")
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12), additionalData: aad(id, `dek:${version}`) }, master, packed.slice(12)))
}
export async function encryptSecret(id: string, secret: string, master: CryptoKey, keyVersion: number): Promise<EncryptedSecret> {
  const rawDek = crypto.getRandomValues(new Uint8Array(32)), plaintext = encoder.encode(secret)
  try {
    const dek = await crypto.subtle.importKey("raw", rawDek, "AES-GCM", false, ["encrypt"])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(id, "secret") }, dek, plaintext))
    return { ciphertext, iv, wrappedDek: await wrap(id, rawDek, master, keyVersion), keyVersion }
  } finally { rawDek.fill(0); plaintext.fill(0) }
}
export async function decryptSecret(id: string, value: EncryptedSecret, master: CryptoKey) {
  const rawDek = await unwrap(id, value.wrappedDek, master, value.keyVersion)
  let plaintext: Uint8Array<ArrayBuffer> | undefined
  try {
    const dek = await crypto.subtle.importKey("raw", rawDek, "AES-GCM", false, ["decrypt"])
    plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv, additionalData: aad(id, "secret") }, dek, value.ciphertext))
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext)
  } finally { rawDek.fill(0); plaintext?.fill(0) }
}
export async function rewrapDek(id: string, wrappedDek: Uint8Array<ArrayBuffer>, oldMaster: CryptoKey, oldVersion: number, newMaster: CryptoKey, newVersion: number) {
  const raw = await unwrap(id, wrappedDek, oldMaster, oldVersion)
  try { return await wrap(id, raw, newMaster, newVersion) }
  finally { raw.fill(0) }
}
