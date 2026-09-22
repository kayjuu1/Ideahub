import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"

const securityHeaders = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const { requestNonce } = await import("./lib/nonce.server")
  const nonce = requestNonce(request)
  const length = Number(request.headers.get("Content-Length") ?? "0")
  const result = length > 11 * 1024 * 1024
    ? { response: new Response("Request exceeds the 10 MB file upload limit.", { status: 413 }) }
    : await next()
  const response = new Response(result.response.body, result.response)
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "no-referrer")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
  const scripts = import.meta.env.DEV ? "'self' 'unsafe-inline' 'unsafe-eval'" : `'self' 'nonce-${nonce}'`
  response.headers.set("Content-Security-Policy", `default-src 'self'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${import.meta.env.DEV ? " ws: wss:" : ""}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`)
  if (new URL(request.url).protocol === "https:") response.headers.set("Strict-Transport-Security", "max-age=31536000")
  return response
})

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

// Defining a custom Start instance replaces its default CSRF middleware.
const csrf = createCsrfMiddleware({ filter: (context) => context.handlerType === "serverFn" })
export const startInstance = createStart(() => ({ requestMiddleware: [securityHeaders, csrf, privatePages] }))
