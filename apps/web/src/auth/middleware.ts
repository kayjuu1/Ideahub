import { createMiddleware } from "@tanstack/react-start"
import { AccessError, requireRole } from "./policy"
import type { Role } from "./policy"
import { AppError } from "../lib/app-error"
import { ZodError } from "zod"

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
      error.stack = undefined
      throw error
    }
    if (error instanceof ZodError) {
      setResponseStatus(400)
      const safe = new Error("Check the submitted fields and try again.")
      safe.stack = undefined
      throw safe
    }
    setResponseStatus(500)
    console.error(JSON.stringify({ event: "protected_operation_failed" }))
    const safe = new Error("Unable to complete this operation. Please try again.")
    safe.stack = undefined
    throw safe
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
      const db = getDatabase()
      const { consumeLimit } = await import("../lib/rate-limit.server")
      const { getRequest } = await import("@tanstack/react-start/server")
      const writing = getRequest().method !== "GET"
      await consumeLimit(db, context.identity.user.id, writing ? "app-write" : "app-read", writing ? 120 : 600, 300000)
      return next({ context: { db } })
    })
}
