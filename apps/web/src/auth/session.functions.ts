import { createServerFn } from "@tanstack/react-start"
import { protectedFn } from "./middleware"

export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([protectedFn("viewer")])
  .handler(({ context }) => {
    const { id, name, email, role } = context.identity.user
    return { id, name, email, role }
  })

export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([protectedFn("admin")])
  .handler(() => ({ allowed: true }))
