import { getAuth } from "./auth.server"

// Public authentication endpoints are the sole intentional HTTP exception to
// protectedFn. Better Auth validates their inputs, origins, sessions and tokens.
const publicEndpoints = new Set(["/sign-in/email", "/sign-out", "/get-session", "/ok"])

export async function handleAuth(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "")
  if (!publicEndpoints.has(path)) {
    return Response.json({ message: "This authentication operation is unavailable." }, { status: 403 })
  }
  const response = await getAuth().handler(request)
  response.headers.set("Cache-Control", "no-store")
  return response
}
