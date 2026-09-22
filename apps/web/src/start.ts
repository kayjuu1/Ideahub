import { createMiddleware, createStart } from "@tanstack/react-start"

const privatePages = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const path = new URL(request.url).pathname
  const minimum = /^\/vault(?:\/|$)/.test(path) ? "editor" : /^\/admin(?:\/|$)/.test(path) ? "admin" : undefined
  if (minimum) {
    const { getAuth } = await import("./auth/auth.server")
    const { authenticate } = await import("./auth/authenticate")
    const { AccessError } = await import("./auth/policy")
    try { authenticate(await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } }), minimum) }
    catch (error) { return new Response(error instanceof AccessError ? error.message : "Unable to verify access.", { status: error instanceof AccessError ? error.status : 503, headers: { "Cache-Control": "no-store" } }) }
  }
  return next()
})

export const startInstance = createStart(() => ({ requestMiddleware: [privatePages] }))
