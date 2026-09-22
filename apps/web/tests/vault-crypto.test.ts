import { describe, expect, it } from "vitest"
import { randomBytes } from "node:crypto"
import { decryptSecret, encryptSecret, importMasterKey, rewrapDek } from "../src/features/vault/crypto.server"

describe("vault envelope encryption", () => {
  const key = () => importMasterKey(randomBytes(32).toString("base64"))
  it("round-trips Unicode and uses independent randomized envelopes", async () => {
    const master = await key(), secret = "Private 🔑 credential"
    const first = await encryptSecret("entry", secret, master, 1), second = await encryptSecret("entry", secret, master, 1)
    expect(await decryptSecret("entry", first, master)).toBe(secret)
    expect(first.iv).toHaveLength(12)
    expect(first.wrappedDek).toHaveLength(60)
    expect(first.iv).not.toEqual(second.iv)
    expect(first.ciphertext).not.toEqual(second.ciphertext)
    expect(new TextDecoder().decode(first.ciphertext)).not.toContain(secret)
  })
  it("rejects wrong keys, swapped entry IDs, tampered ciphertext and key versions", async () => {
    const master = await key(), value = await encryptSecret("entry", "private", master, 1)
    await expect(decryptSecret("entry", value, await key())).rejects.toThrow()
    await expect(decryptSecret("other", value, master)).rejects.toThrow()
    await expect(decryptSecret("entry", { ...value, keyVersion: 2 }, master)).rejects.toThrow()
    value.ciphertext[0] ^= 1
    await expect(decryptSecret("entry", value, master)).rejects.toThrow()
  })
  it("rewraps the DEK without re-encrypting the secret", async () => {
    const oldKey = await key(), newKey = await key(), value = await encryptSecret("entry", "unchanged", oldKey, 1)
    const wrappedDek = await rewrapDek("entry", value.wrappedDek, oldKey, 1, newKey, 2)
    expect(wrappedDek).not.toEqual(value.wrappedDek)
    expect(await decryptSecret("entry", { ...value, wrappedDek, keyVersion: 2 }, newKey)).toBe("unchanged")
    await expect(decryptSecret("entry", { ...value, wrappedDek, keyVersion: 2 }, oldKey)).rejects.toThrow()
  })
})
