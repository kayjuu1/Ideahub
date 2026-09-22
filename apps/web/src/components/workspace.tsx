import { Link } from "@tanstack/react-router"
import { useTheme } from "next-themes"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "../auth/client"
import type { ReactNode } from "react"
import { PeopleSearch } from "./people-search"

export function Workspace({ children, name }: { children: ReactNode; name: string }) {
  const { theme, setTheme } = useTheme()
  return <div className="min-h-svh bg-muted/20">
    <header className="border-b bg-background px-6 py-3"><div className="mx-auto flex max-w-screen-2xl items-center gap-4">
      <Link to="/" className="flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-md bg-primary text-xs text-primary-foreground">IG</span>IdeaGap</Link>
      <nav className="ml-6 flex gap-5 text-sm"><Link to="/" activeProps={{ className: "font-semibold text-primary" }} activeOptions={{ exact: true }}>Overview</Link><Link to="/people" activeProps={{ className: "font-semibold text-primary" }}>People</Link></nav>
      <span className="ml-auto text-sm text-muted-foreground">{name}</span>
      <PeopleSearch />
      <Button size="sm" variant="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Theme</Button>
      <Button size="sm" variant="outline" onClick={async () => { await authClient.signOut(); window.location.assign("/login") }}>Sign out</Button>
    </div></header>
    <main className="mx-auto max-w-screen-2xl px-6 py-8">{children}</main>
  </div>
}
