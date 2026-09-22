import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Workspace } from "../../components/workspace"
import { loadIdentity } from "../../auth/route-access"
import { getPerson, updatePerson } from "../../features/people/people.functions"
import { PersonForm } from "../../features/people/person-form"
import { PersonMemberships } from "../../features/taxonomy/person-memberships"

export const Route = createFileRoute("/people/$personId")({ beforeLoad: loadIdentity, component: PersonPage })
function PersonPage() {
  const { user } = Route.useRouteContext(), { personId } = Route.useParams(), cache = useQueryClient()
  const [editing, setEditing] = useState(false)
  const query = useQuery({ queryKey: ["person", personId], queryFn: () => getPerson({ data: { id: personId } }) })
  const person = query.data
  return <Workspace name={user.name}><Link to="/people" className="text-sm text-muted-foreground hover:text-primary">← All people</Link>
    {query.isPending ? <Skeleton className="mt-8 h-64 w-full" /> : !person ? <div className="mt-8" role="alert">This person could not be loaded. They may have been deleted.</div> : <>
      <div className="my-6 flex items-start justify-between"><div><div className="flex items-center gap-3"><h1 className="font-heading text-3xl font-semibold">{person.name}</h1><Badge variant="secondary">{person.status}</Badge></div><p className="mt-2 text-muted-foreground">{[person.rolePosition, person.organization].filter(Boolean).join(" · ")}</p></div>{user.role !== "viewer" && !editing && <Button variant="outline" onClick={() => setEditing(true)}>Edit profile</Button>}</div>
      <section className="max-w-3xl rounded-lg border bg-card p-6"><h2 className="mb-5 font-semibold">Profile</h2>{editing ? <PersonForm initial={{ name: person.name, email: person.email ?? "", phone: person.phone ?? "", organization: person.organization ?? "", rolePosition: person.rolePosition ?? "", status: person.status, notesSummary: person.notesSummary ?? "" }} onCancel={() => setEditing(false)} onSave={async (data) => { await updatePerson({ data: { ...data, id: personId } }); await cache.invalidateQueries({ queryKey: ["person", personId] }); await cache.invalidateQueries({ queryKey: ["people"] }); setEditing(false); toast.success("Profile updated") }} /> : <dl className="grid gap-6 sm:grid-cols-2">{([ ["Email", person.email], ["Phone", person.phone], ["Organization", person.organization], ["Role / position", person.rolePosition], ["Summary", person.notesSummary] ] as const).map(([label, value]) => <div key={label}><dt className="mb-1 text-xs font-medium text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap text-sm">{value || "—"}</dd></div>)}</dl>}</section>
      <PersonMemberships personId={personId} editable={user.role !== "viewer"} />
    </>}
  </Workspace>
}
