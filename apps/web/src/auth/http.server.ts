import { getAuth } from "./auth.server"

// Public authentication endpoints are the sole intentional HTTP exception to
// protectedFn. Better Auth validates their inputs, origins, sessions and tokens.
const publicEndpoints = new Set(["/sign-in/email", "/sign-out", "/get-session", "/ok", "/request-password-reset", "/reset-password"])

export async function handleAuth(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "")
  if (!publicEndpoints.has(path) && !/^\/reset-password\/[A-Za-z0-9_-]{16,128}$/.test(path)) {
    return Response.json({ message: "This authentication operation is unavailable." }, { status: 403 })
  }
  const response = await getAuth().handler(request)
  if (path === "/request-password-reset" && response.status >= 500) {
    return Response.json({ status: true, message: "If this email exists in our system, check your email for the reset link" }, { headers: { "Cache-Control": "no-store" } })
  }
  response.headers.set("Cache-Control", "no-store")
  return response
}
