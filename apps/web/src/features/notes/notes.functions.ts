import { createServerFn } from "@tanstack/react-start"
import { protectedFn } from "../../auth/middleware"
import { noteDelete, noteInput, noteUpdate, personPage } from "./validation"

export const listNotes = createServerFn({ method: "GET" }).middleware([protectedFn()]).validator(personPage).handler(async ({ context, data }) => {
  const service = await import("./notes.server")
  return service.list(context.db, data)
})
export const getTimeline = createServerFn({ method: "GET" }).middleware([protectedFn()]).validator(personPage).handler(async ({ context, data }) => {
  const service = await import("./notes.server")
  return service.timeline(context.db, data)
})
export const createNote = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(noteInput).handler(async ({ context, data }) => {
  const service = await import("./notes.server")
  return service.create(context.db, context.identity.user.id, data)
})
export const updateNote = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(noteUpdate).handler(async ({ context, data }) => {
  const service = await import("./notes.server")
  return service.change(context.db, context.identity.user, data)
})
export const deleteNote = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(noteDelete).handler(async ({ context, data }) => {
  const service = await import("./notes.server")
  return service.remove(context.db, context.identity.user, data)
})
