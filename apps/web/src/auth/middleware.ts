import { createMiddleware } from "@tanstack/react-start"
import { AccessError, requireRole } from "./policy"
import type { Role } from "./policy"
import { AppError } from "../lib/app-error"

export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequestHeaders, setResponseHeader, setResponseStatus } = await import("@tanstack/react-start/server")
  const { getAuth } = await import("./auth.server")
  const { authenticate } = await import("./authenticate")
  setResponseHeader("Cache-Control", "no-store")
  try {
    const session = await getAuth().api.getSession({ headers: getRequestHeaders(), query: { disableCookieCache: true } })
    return await next({ context: { identity: authenticate(session) } })
  } catch (error) {
    if (error instanceof AccessError || error instanceof AppError) {
      setResponseStatus(error.status)
      throw error
    }
    setResponseStatus(500)
    console.error(JSON.stringify({ event: "protected_operation_failed" }))
    throw new Error("Unable to complete this operation. Please try again.")
  }
})

export function protectedFn(minimum: Role = "viewer") {
  return createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      try {
        requireRole(context.identity.user.role, minimum)
      } catch (error) {
        const { setResponseStatus } = await import("@tanstack/react-start/server")
        if (error instanceof AccessError) setResponseStatus(error.status)
        throw error
      }
      const { getDatabase } = await import("../db/database.server")
      return next({ context: { db: getDatabase() } })
    })
}
