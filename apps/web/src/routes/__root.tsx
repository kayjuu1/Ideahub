import { HeadContent, Scripts, createRootRoute, useRouter } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { useState } from "react"

import appCss from "@workspace/ui/globals.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "IdeaGap · People & Partners",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  errorComponent: ({ reset }) => <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">Unable to open this page</h1><p className="my-4 text-muted-foreground">Please try again. If access has changed, sign in again or contact an administrator.</p><button className="rounded border px-4 py-2" onClick={reset}>Try again</button><a href="/login" className="ml-4 underline">Sign in</a></main>,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } }))
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={router.options.ssr?.nonce}>
          <QueryClientProvider client={queryClient}>{children}<Toaster richColors /></QueryClientProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
