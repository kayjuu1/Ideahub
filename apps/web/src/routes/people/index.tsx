import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "sonner"
import { Workspace } from "../../components/workspace"
import { loadIdentity } from "../../auth/route-access"
import { createPerson, deletePerson, getPeopleFilters, listPeople } from "../../features/people/people.functions"
import { PersonForm } from "../../features/people/person-form"
import { peopleQuery, personStatus } from "../../features/people/validation"
import { BulkActions } from "../../features/taxonomy/bulk-actions"

export const Route = createFileRoute("/people/")({ beforeLoad: loadIdentity, component: PeoplePage })
const features = tableFeatures({})
type PersonRow = Awaited<ReturnType<typeof listPeople>>["rows"][number]
const column = createColumnHelper<typeof features, PersonRow>()
const emptyRows: PersonRow[] = []

function PeoplePage() {
  const { user } = Route.useRouteContext(), navigate = useNavigate(), cache = useQueryClient()
  const [search, setSearch] = useState(""), [debounced, setDebounced] = useState("")
  const [page, setPage] = useState(0), [status, setStatus] = useState("")
  const [organization, setOrganization] = useState(""), [groupId, setGroupId] = useState(""), [tagId, setTagId] = useState("")
  const [sort, setSort] = useState<"name" | "organization" | "status" | "updatedAt">("updatedAt"), [descending, setDescending] = useState(true)
  const [creating, setCreating] = useState(false), [deleting, setDeleting] = useState<PersonRow | null>(null), [deleteBusy, setDeleteBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => { const timer = setTimeout(() => { setDebounced(search); setPage(0) }, 300); return () => clearTimeout(timer) }, [search])
  const input = peopleQuery.parse({ page, search: debounced, status: status || undefined, organization: organization || undefined, groupId: groupId || undefined, tagId: tagId || undefined, sort, desc: descending })
  const result = useQuery({ queryKey: ["people", input], queryFn: () => listPeople({ data: input }) })
  const filters = useQuery({ queryKey: ["people-filters"], queryFn: () => getPeopleFilters() })
  const columns = useMemo(() => column.columns([
    column.display({ id: "select", header: "Select", cell: ({ row }) => user.role !== "viewer" && <input type="checkbox" aria-label={`Select ${row.original.name}`} checked={selected.includes(row.original.id)} onChange={() => setSelected((ids) => ids.includes(row.original.id) ? ids.filter((id) => id !== row.original.id) : [...ids, row.original.id])} /> }),
    column.accessor("name", { header: "Name", cell: ({ row }) => <Link className="font-medium text-primary hover:underline" to="/people/$personId" params={{ personId: row.original.id }}>{row.original.name}</Link> }),
    column.accessor("organization", { header: "Organization", cell: ({ getValue }) => getValue() || "—" }),
    column.accessor("rolePosition", { header: "Role / position", cell: ({ getValue }) => getValue() || "—" }),
    column.accessor("status", { header: "Status", cell: ({ getValue }) => <Badge variant="secondary" className="capitalize">{getValue()}</Badge> }),
    column.display({ id: "groups", header: "Groups", cell: ({ row }) => row.original.groups.slice(0, 2).map((group) => <Badge key={group.id} variant="outline" className="mr-1">{group.name}</Badge>) }),
    column.display({ id: "tags", header: "Tags", cell: ({ row }) => row.original.tags.slice(0, 2).map((tag) => <Badge key={tag.id} variant="outline" className="mr-1">{tag.name}</Badge>) }),
    column.accessor("updatedAt", { header: "Updated", cell: ({ getValue }) => new Date(getValue()).toLocaleDateString() }),
    column.display({ id: "actions", header: "", cell: ({ row }) => user.role !== "viewer" && <Button size="sm" variant="ghost" onClick={() => setDeleting(row.original)}>Delete</Button> }),
  ]), [user.role, selected])
  const table = useTable({ features, columns, data: result.data?.rows ?? emptyRows })
  const selectClass = "h-9 rounded-md border bg-background px-3 text-sm"
  return <Workspace name={user.name} role={user.role}>
    <div className="mb-6 flex items-center justify-between"><div><h1 className="font-heading text-3xl font-semibold">People</h1><p className="mt-1 text-sm text-muted-foreground">Your contacts and the relationships behind them.</p></div>{user.role !== "viewer" && <Button onClick={() => setCreating(true)}>Add person</Button>}</div>
    <div className="mb-4 flex flex-wrap gap-2">
      <Input aria-label="Search people" placeholder="Search name, email, organization…" className="w-80" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Filter status" className={selectClass} value={status} onChange={(event) => { setStatus(event.target.value ? personStatus.parse(event.target.value) : ""); setPage(0) }}><option value="">All statuses</option>{personStatus.options.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter organization" className={selectClass} value={organization} onChange={(event) => { setOrganization(event.target.value); setPage(0) }}><option value="">All organizations</option>{filters.data?.organizations.map((name) => <option key={name}>{name}</option>)}</select>
      <select aria-label="Filter group" className={selectClass} value={groupId} onChange={(event) => { setGroupId(event.target.value); setPage(0) }}><option value="">All groups</option>{filters.data?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
      <select aria-label="Filter tag" className={selectClass} value={tagId} onChange={(event) => { setTagId(event.target.value); setPage(0) }}><option value="">All tags</option>{filters.data?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
      <select aria-label="Sort people" className={selectClass} value={sort} onChange={(event) => { setSort(peopleQuery.shape.sort.parse(event.target.value)); setPage(0) }}><option value="updatedAt">Last updated</option><option value="name">Name</option><option value="organization">Organization</option><option value="status">Status</option></select>
      <Button variant="outline" aria-label="Toggle sort direction" onClick={() => setDescending(!descending)}>{descending ? "↓" : "↑"}</Button>
    </div>
    {user.role !== "viewer" && <BulkActions ids={selected} clear={() => setSelected([])} />}
    <div className="rounded-lg border bg-card">
      {result.isPending ? <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div> : result.isError ? <div className="p-8" role="alert">Unable to load people. <Button variant="link" onClick={() => void result.refetch()}>Try again</Button></div> : !result.data.rows.length ? <div className="p-12 text-center text-sm text-muted-foreground">{debounced || status || organization || groupId || tagId ? "No matching people — adjust your filters." : "No people yet — add your first contact."}</div> : <Table>
        <TableHeader>{table.getHeaderGroups().map((header) => <TableRow key={header.id}>{header.headers.map((cell) => <TableHead key={cell.id}><table.FlexRender header={cell} /></TableHead>)}</TableRow>)}</TableHeader>
        <TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getAllCells().map((cell) => <TableCell key={cell.id}><table.FlexRender cell={cell} /></TableCell>)}</TableRow>)}</TableBody>
      </Table>}
    </div>
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{result.data?.total ?? 0} people · Page {page + 1}</span><div className="flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={(page + 1) * 25 >= (result.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>Add person</DialogTitle><DialogDescription>Start with a name, then add the details you know.</DialogDescription></DialogHeader><PersonForm onCancel={() => setCreating(false)} onSave={async (data) => { const created = await createPerson({ data }); await cache.invalidateQueries({ queryKey: ["people"] }); toast.success("Person added"); await navigate({ to: "/people/$personId", params: { personId: created.id } }) }} /></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogDescription>This removes the person from the workspace. Their history is retained for audit purposes.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={deleteBusy} onClick={async () => { if (!deleting) return; setDeleteBusy(true); try { await deletePerson({ data: { id: deleting.id } }); setDeleting(null); await cache.invalidateQueries({ queryKey: ["people"] }); toast.success("Person deleted") } catch { toast.error("Unable to delete. Reload and try again.") } finally { setDeleteBusy(false) } }}>Delete person</Button></div></DialogContent></Dialog>
  </Workspace>
}
