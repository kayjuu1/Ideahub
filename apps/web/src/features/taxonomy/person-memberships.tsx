import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { changeMembership, getMemberships, listTaxonomy } from "./taxonomy.functions"

export function PersonMemberships({ personId, editable }: { personId: string; editable: boolean }) {
  const cache = useQueryClient(), [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: ["memberships", personId], queryFn: () => getMemberships({ data: { personId } }) })
  const all = useQuery({ queryKey: ["taxonomy"], queryFn: () => listTaxonomy() })
  const [group, setGroup] = useState(""), [tag, setTag] = useState("")
  async function change(kind: "group" | "tag", targetId: string, remove = false) {
    setBusy(true)
    try { await changeMembership({ data: { kind, targetId, personIds: [personId], remove } }); await cache.invalidateQueries(); toast.success("Membership updated") }
    catch { toast.error("Unable to update membership. Reload and try again.") } finally { setBusy(false) }
  }
  return <section className="mt-6 max-w-3xl rounded-lg border bg-card p-6"><h2 className="mb-4 font-semibold">Groups & tags</h2>{(["group", "tag"] as const).map((kind) => {
    const current = kind === "group" ? query.data?.groups : query.data?.tags, available = kind === "group" ? all.data?.groups : all.data?.tags
    const selected = kind === "group" ? group : tag, setter = kind === "group" ? setGroup : setTag
    return <div key={kind} className="mb-4"><h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">{kind}s</h3><div className="mb-2 flex flex-wrap gap-2">{current?.map((item) => <Badge key={item.id} variant="outline">{item.name}{editable && <button type="button" className="ml-2" aria-label={`Remove ${item.name}`} disabled={busy} onClick={() => void change(kind, item.id, true)}>×</button>}</Badge>)}{!current?.length && <span className="text-sm text-muted-foreground">No {kind}s assigned.</span>}</div>{editable && <div className="flex gap-2"><select aria-label={`Choose ${kind}`} className="h-9 rounded-md border bg-background px-3 text-sm" value={selected} onChange={(event) => setter(event.target.value)}><option value="">Choose {kind}</option>{available?.filter((item) => !current?.some((member) => member.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button variant="outline" disabled={!selected || busy} onClick={() => void change(kind, selected)}>Add</Button></div>}</div>
  })}</section>
}
