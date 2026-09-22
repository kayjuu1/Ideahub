import { importMasterKey } from "./crypto.server"
import { fail } from "../../lib/errors.server"

// A key cache is process configuration, never request/user state. Development
// gets one non-extractable ephemeral key for this Worker isolate only.
let temporaryKey: Promise<CryptoKey> | undefined
export const ephemeralDevelopment = import.meta.env.DEV
export async function currentMasterKey() {
  if (ephemeralDevelopment) {
    temporaryKey ??= crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    return { key: await temporaryKey, version: 1 }
  }
  const version = Number(process.env.VAULT_KEY_VERSION ?? "1")
  if (!Number.isSafeInteger(version) || version < 1 || !process.env.VAULT_MASTER_KEY) fail(503, "The vault master key is not configured.")
  try { return { key: await importMasterKey(process.env.VAULT_MASTER_KEY), version } }
  catch { return fail(503, "The vault master key is not configured correctly.") }
}
export async function masterKeyFor(version: number) {
  const current = await currentMasterKey()
  if (version === current.version) return current.key
  try {
    const previous: unknown = JSON.parse(process.env.VAULT_PREVIOUS_MASTER_KEYS ?? "{}")
    if (typeof previous !== "object" || previous === null || !(String(version) in previous)) throw new Error()
    const value: unknown = Reflect.get(previous, String(version))
    if (typeof value !== "string") throw new Error()
    return await importMasterKey(value)
  } catch { return fail(503, "The key needed for this vault entry is unavailable.") }
}
