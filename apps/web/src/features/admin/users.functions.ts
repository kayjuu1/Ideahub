import { createServerFn } from "@tanstack/react-start"
import { protectedFn } from "../../auth/middleware"
import { banInput, managedUserInput, roleInput, userIdInput } from "./validation"

export const listManagedUsers = createServerFn({ method: "GET" }).middleware([protectedFn("admin")]).handler(async () => {
  const service = await import("./users.server")
  return service.list()
})
export const createManagedUser = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).validator(managedUserInput).handler(async ({ context, data }) => {
  const service = await import("./users.server")
  return service.create(context.db, context.identity.user.id, data)
})
export const changeManagedRole = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).validator(roleInput).handler(async ({ context, data }) => {
  const service = await import("./users.server")
  return service.changeRole(context.db, context.identity.user.id, data)
})
export const setManagedBan = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).validator(banInput).handler(async ({ context, data }) => {
  const service = await import("./users.server")
  return service.setBan(context.db, context.identity.user.id, data)
})
export const resetManagedPassword = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).validator(userIdInput).handler(async ({ context, data }) => {
  const service = await import("./users.server")
  return service.resetPassword(context.db, context.identity.user.id, data.userId)
})
