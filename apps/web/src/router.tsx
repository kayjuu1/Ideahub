import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { createIsomorphicFn } from "@tanstack/react-start"

const getNonce = createIsomorphicFn().server(async () => {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { requestNonce } = await import("./lib/nonce.server")
  return requestNonce(getRequest())
}).client(async () => document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.content)

export async function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    ssr: { nonce: await getNonce() },

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
