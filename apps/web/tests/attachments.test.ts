import { describe, expect, it } from "vitest"
import { validateFile } from "../src/features/attachments/sniff.server"
import { MAX_FILE_SIZE, sanitizeFilename } from "../src/features/attachments/validation"

describe("attachment validation", () => {
  it("rejects oversize files before reading their contents", async () => {
    await expect(validateFile(new File([new Uint8Array(MAX_FILE_SIZE + 1)], "too-large.pdf"))).rejects.toMatchObject({ status: 413 })
  })
  it("rejects disallowed extensions and disguised executable content", async () => {
    await expect(validateFile(new File(["%PDF-1.7\n"], "run.exe"))).rejects.toMatchObject({ status: 415 })
    await expect(validateFile(new File(["MZ executable"], "photo.png", { type: "image/png" }))).rejects.toMatchObject({ status: 415 })
  })
  it("accepts actual PDF signatures and UTF-8 CSV, rejects binary CSV", async () => {
    expect((await validateFile(new File(["%PDF-1.7\nhello\n%%EOF"], "note.pdf"))).contentType).toBe("application/pdf")
    expect((await validateFile(new File(["Name,Role\nAma,Mentor"], "contacts.csv"))).contentType).toBe("text/csv")
    await expect(validateFile(new File([new Uint8Array([0, 44, 255])], "binary.csv"))).rejects.toMatchObject({ status: 415 })
    await expect(validateFile(new File(["<script>,alert(1)</script>"], "page.csv"))).rejects.toMatchObject({ status: 415 })
  })
  it("normalizes path and header characters", () => {
    expect(sanitizeFilename('../../bad\r\n"name.pdf')).toBe('_.._bad___name.pdf')
    expect(sanitizeFilename("....")).toBe("attachment")
  })
})
