import { createServerFn } from "@tanstack/react-start"
import { protectedFn } from "../../auth/middleware"

export const getDashboard = createServerFn({ method: "GET" }).middleware([protectedFn()]).handler(async ({ context }) => {
  const service = await import("./dashboard.server")
  return service.summary(context.db)
})
