import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Workspace } from "../../components/workspace"
import { loadIdentity } from "../../auth/route-access"
import { getAdminAccess } from "../../auth/session.functions"
import { listAuditLog } from "../../features/admin/audit.functions"

export const Route = createFileRoute("/admin/audit")({ beforeLoad: async () => { const identity = await loadIdentity(); await getAdminAccess(); return identity }, component: AuditPage })
const entities = z.enum(["all", "person", "group", "tag", "note", "attachment", "vault", "user"])
function AuditPage() {
  const { user } = Route.useRouteContext(), [page, setPage] = useState(0), [entityType, setEntityType] = useState<z.infer<typeof entities>>("all")
  const query = useQuery({ queryKey: ["audit", page, entityType], queryFn: () => listAuditLog({ data: { page, entityType } }) })
  return <Workspace name={user.name} role={user.role}><h1 className="text-3xl font-semibold">Activity audit</h1><p className="my-3 text-sm text-muted-foreground">Append-only history of application changes and account operations.</p><label className="mb-4 block text-sm">Record type <select className="ml-2 rounded border bg-background p-2" value={entityType} onChange={(event) => { setEntityType(entities.parse(event.target.value)); setPage(0) }}>{entities.options.map((type) => <option key={type}>{type}</option>)}</select></label>{query.isPending ? <Skeleton className="h-64" /> : query.isError ? <p role="alert">Unable to load activity.</p> : <div className="overflow-x-auto rounded border bg-card"><table className="w-full text-left text-sm"><thead><tr>{["Time", "Actor", "Action", "Record", "Details"].map((title) => <th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{query.data.map((row) => <tr key={row.id} className="border-t"><td className="whitespace-nowrap p-3">{new Date(row.createdAt).toLocaleString()}</td><td className="p-3">{row.actor}</td><td className="p-3">{row.action.replaceAll("_", " ")}</td><td className="p-3 text-xs">{row.entityType}<br />{row.entityId}</td><td className="max-w-md break-words p-3 text-xs"><details><summary className="cursor-pointer">View changes</summary><pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(JSON.parse(row.metadata), null, 2)}</pre></details></td></tr>)}</tbody></table>{query.data.length === 0 && <p className="p-6">No activity for this selection.</p>}</div>}<div className="mt-4 flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" disabled={!query.data || query.data.length < 50} onClick={() => setPage(page + 1)}>Next</Button></div></Workspace>
}
