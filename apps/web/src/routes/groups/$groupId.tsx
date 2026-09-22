import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Workspace } from "../../components/workspace"
import { loadIdentity } from "../../auth/route-access"
import { listPeople } from "../../features/people/people.functions"
import { changeMembership, listTaxonomy } from "../../features/taxonomy/taxonomy.functions"

export const Route = createFileRoute("/groups/$groupId")({ beforeLoad: loadIdentity, component: GroupPage })
function GroupPage() {
  const { user } = Route.useRouteContext(), { groupId } = Route.useParams(), cache = useQueryClient()
  const [adding, setAdding] = useState(false), [selected, setSelected] = useState<string[]>([]), [search, setSearch] = useState(""), [debounced, setDebounced] = useState(""), [page, setPage] = useState(0), [busy, setBusy] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(timer) }, [search])
  const taxonomy = useQuery({ queryKey: ["taxonomy"], queryFn: () => listTaxonomy() })
  const group = taxonomy.data?.groups.find((item) => item.id === groupId)
  const members = useQuery({ queryKey: ["group-members", groupId, page], queryFn: () => listPeople({ data: { groupId, page, pageSize: 25 } }) })
  const candidates = useQuery({ queryKey: ["people-search", debounced, "group-add"], queryFn: () => listPeople({ data: { search: debounced, pageSize: 100 } }), enabled: adding })
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  async function change(remove: boolean) { setBusy(true); try { await changeMembership({ data: { personIds: selected, kind: "group", targetId: groupId, remove } }); setSelected([]); setAdding(false); await cache.invalidateQueries(); toast.success("Group membership updated") } catch { toast.error("Unable to update group membership.") } finally { setBusy(false) } }
  return <Workspace name={user.name}><Link to="/groups" className="text-sm text-muted-foreground">← All groups</Link><div className="my-6 flex justify-between"><div><h1 className="font-heading text-3xl font-semibold">{group?.name ?? "Group"}</h1><p className="mt-1 text-sm text-muted-foreground">{group?.description}</p></div>{user.role !== "viewer" && <div className="flex gap-2"><Button variant="outline" disabled={!selected.length || busy} onClick={() => void change(true)}>Remove selected</Button><Button onClick={() => { setSelected([]); setAdding(true) }}>Add members</Button></div>}</div>
    {!members.data?.rows.length ? <p className="rounded-lg border p-8 text-muted-foreground">{members.isPending ? "Loading members…" : "No visible members — add people to this group."}</p> : <div className="divide-y rounded-lg border bg-card">{members.data.rows.map((person) => <div key={person.id} className="flex items-center gap-3 p-4">{user.role !== "viewer" && <input type="checkbox" aria-label={`Select ${person.name}`} checked={selected.includes(person.id)} onChange={() => toggle(person.id)} />}<Link to="/people/$personId" params={{ personId: person.id }} className="font-medium text-primary">{person.name}</Link><span className="ml-auto text-sm text-muted-foreground">{person.organization}</span></div>)}</div>}
    <div className="mt-4 flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => { setPage(page - 1); setSelected([]) }}>Previous</Button><Button variant="outline" disabled={(page + 1) * 25 >= (members.data?.total ?? 0)} onClick={() => { setPage(page + 1); setSelected([]) }}>Next</Button></div>
    <Dialog open={adding} onOpenChange={(open) => { setAdding(open); setSelected([]) }}><DialogContent><DialogHeader><DialogTitle>Add people to {group?.name}</DialogTitle><DialogDescription>Select people below. Existing memberships are preserved.</DialogDescription></DialogHeader><Input aria-label="Find people to add" placeholder="Search people…" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="max-h-72 overflow-auto">{candidates.data?.rows.map((person) => <label key={person.id} className="flex items-center gap-3 py-2"><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} />{person.name}</label>)}</div><Button disabled={!selected.length || busy} onClick={() => void change(false)}>Add {selected.length} people</Button></DialogContent></Dialog>
  </Workspace>
}
