import { validateInput } from "../../lib/validate-input"
import { createServerFn } from "@tanstack/react-start"
import { protectedFn } from "../../auth/middleware"
import { attachmentId, attachmentPerson } from "./validation"
import { AppError } from "../../lib/app-error"

export const listAttachments = createServerFn({ method: "GET" }).middleware([protectedFn()]).validator(validateInput(attachmentPerson)).handler(async ({ context, data }) => {
  const service = await import("./attachments.server")
  return service.list(context.db, data.personId)
})
export const uploadAttachment = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator((input: FormData) => {
  if (!(input instanceof FormData)) throw new AppError(400, "Choose a file to upload.")
  const person = attachmentPerson.safeParse({ personId: input.get("personId") })
  const file = input.get("file")
  if (!person.success || !(file instanceof File)) throw new AppError(400, "Choose a file and a valid person.")
  return { ...person.data, file }
}).handler(async ({ context, data }) => {
  const [{ env }, service] = await Promise.all([import("cloudflare:workers"), import("./attachments.server")])
  if (!env.ATTACHMENTS) throw new AppError(503, "Attachment storage is not configured.")
  return service.upload(context.db, env.ATTACHMENTS, context.identity.user.id, data.personId, data.file)
})
export const downloadAttachment = createServerFn({ method: "GET" }).middleware([protectedFn("editor")]).validator(validateInput(attachmentId)).handler(async ({ context, data }) => {
  const [{ env }, service] = await Promise.all([import("cloudflare:workers"), import("./attachments.server")])
  if (!env.ATTACHMENTS) throw new AppError(503, "Attachment storage is not configured.")
  return service.download(context.db, env.ATTACHMENTS, data)
})
export const deleteAttachment = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(validateInput(attachmentId)).handler(async ({ context, data }) => {
  const [{ env }, service] = await Promise.all([import("cloudflare:workers"), import("./attachments.server")])
  if (!env.ATTACHMENTS) throw new AppError(503, "Attachment storage is not configured.")
  return service.remove(context.db, env.ATTACHMENTS, context.identity.user.id, data)
})
