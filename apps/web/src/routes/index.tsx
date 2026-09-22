import { createFileRoute, Link } from "@tanstack/react-router"
import { Workspace } from "../components/workspace"
import { loadIdentity } from "../auth/route-access"

export const Route = createFileRoute("/")({ beforeLoad: loadIdentity, component: App })

function App() {
  const { user } = Route.useRouteContext()
  return <Workspace name={user.name}>
    <h1 className="font-heading text-3xl font-semibold">Welcome, {user.name}</h1>
    <p className="mt-3 text-muted-foreground">Keep the people and relationships behind IdeaGap in one place.</p>
    <Link to="/people" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open people</Link>
  </Workspace>
}
