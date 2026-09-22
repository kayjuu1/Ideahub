import { fileTypeFromBuffer } from "file-type"
import { AppError } from "../../lib/app-error"
import { fileExtensions, MAX_FILE_SIZE, sanitizeFilename } from "./validation"

export async function validateFile(file: File) {
  if (!file.size) throw new AppError(400, "Empty files cannot be uploaded.")
  if (file.size > MAX_FILE_SIZE) throw new AppError(413, "Files must be 10 MB or smaller.")
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (!fileExtensions.some((allowed) => allowed === extension)) throw new AppError(415, "Allowed files: PDF, DOC, DOCX, PNG, JPG, WEBP, CSV, XLSX.")
  const bytes = new Uint8Array(await file.arrayBuffer())
  let contentType: string
  if (extension === "csv") {
    let text: string
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes) } catch { throw new AppError(415, "CSV files must contain valid UTF-8 text.") }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || /^\s*</.test(text) || !text.includes(",")) throw new AppError(415, "This file does not contain comma-separated text.")
    contentType = "text/csv"
  } else {
    let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>
    try { detected = await fileTypeFromBuffer(bytes) } catch { throw new AppError(415, "This file is damaged or its format cannot be verified.") }
    // Legacy Office documents share the CFB container. Require the Word stream
    // marker too, so arbitrary OLE files cannot pass by changing an extension.
    const wordMarker = new TextDecoder("utf-16le").decode(bytes).includes("WordDocument")
    if (extension === "doc" && detected?.ext === "cfb" && wordMarker) contentType = "application/msword"
    else {
      const expected = extension === "jpeg" ? "jpg" : extension
      if (!detected || detected.ext !== expected) throw new AppError(415, "The file contents do not match its extension.")
      contentType = detected.mime
    }
  }
  return { bytes, contentType, filename: sanitizeFilename(file.name) }
}
