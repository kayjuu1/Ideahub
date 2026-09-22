import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { changeMembership, changePeopleStatus, listTaxonomy } from "./taxonomy.functions"
import { personStatus } from "../people/validation"

export function BulkActions({ ids, clear }: { ids: string[]; clear: () => void }) {
  const cache = useQueryClient(), [action, setAction] = useState(""), [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: ["taxonomy"], queryFn: () => listTaxonomy() })
  if (!ids.length) return null
  return <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border bg-primary/5 p-3 text-sm"><span>{ids.length} selected</span><select aria-label="Bulk action" className="h-9 rounded-md border bg-background px-3" value={action} onChange={(event) => setAction(event.target.value)}><option value="">Choose action</option><optgroup label="Change status">{personStatus.options.map((status) => <option key={status} value={`status:${status}`}>{status}</option>)}</optgroup><optgroup label="Add to group">{query.data?.groups.map((group) => <option key={group.id} value={`group:${group.id}`}>{group.name}</option>)}</optgroup><optgroup label="Add tag">{query.data?.tags.map((tag) => <option key={tag.id} value={`tag:${tag.id}`}>{tag.name}</option>)}</optgroup></select><Button disabled={busy || !action} onClick={async () => {
    setBusy(true)
    try { const [kind, target] = action.split(":"); if (kind === "status") await changePeopleStatus({ data: { personIds: ids, status: personStatus.parse(target) } }); else if (kind === "group" || kind === "tag") await changeMembership({ data: { kind, personIds: ids, targetId: target } }); await cache.invalidateQueries(); clear(); toast.success("Selected people updated") } catch { toast.error("Unable to update the selection. Refresh and try again.") } finally { setBusy(false) }
  }}>Apply</Button><Button variant="ghost" onClick={clear}>Clear</Button></div>
}
