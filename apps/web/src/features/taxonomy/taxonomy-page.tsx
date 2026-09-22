import { Link } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Workspace } from "../../components/workspace"
import { deleteTaxonomy, listTaxonomy, mergeTags, saveTaxonomy } from "./taxonomy.functions"
import { taxonomyInput } from "./validation"
import type { Role } from "../../auth/policy"
import type { z } from "zod"

type Item = { id: string; name: string; color: string; memberCount: number; description?: string | null }
export function TaxonomyPage({ kind, user }: { kind: "group" | "tag"; user: { name: string; role: Role } }) {
  const cache = useQueryClient(), query = useQuery({ queryKey: ["taxonomy"], queryFn: () => listTaxonomy() })
  const [editing, setEditing] = useState<Item | "new" | null>(null), [deleting, setDeleting] = useState<Item | null>(null), [merging, setMerging] = useState<Item | null>(null)
  const [removeMembers, setRemoveMembers] = useState(false), [target, setTarget] = useState(""), [busy, setBusy] = useState(false)
  const items = kind === "group" ? query.data?.groups : query.data?.tags
  async function refresh() { await cache.invalidateQueries(); toast.success("Changes saved") }
  return <Workspace name={user.name}>
    <div className="mb-6 flex justify-between"><div><h1 className="font-heading text-3xl font-semibold capitalize">{kind}s</h1><p className="mt-1 text-sm text-muted-foreground">{kind === "group" ? "Organize people into meaningful communities." : "Keep your contact labels consistent."}</p></div>{user.role !== "viewer" && <Button onClick={() => setEditing("new")}>Add {kind}</Button>}</div>
    {query.isPending ? <Skeleton className="h-64" /> : query.isError ? <p role="alert">Unable to load {kind}s.</p> : !items?.length ? <div className="rounded-lg border p-12 text-center text-muted-foreground">No {kind}s yet — create your first one.</div> : <div className="divide-y rounded-lg border bg-card">{items.map((item) => <div key={item.id} className="flex items-center gap-4 p-4">
      <span className="size-3 rounded-full" style={{ backgroundColor: item.color }} /><div className="min-w-0 flex-1">{kind === "group" ? <Link to="/groups/$groupId" params={{ groupId: item.id }} className="font-medium hover:text-primary">{item.name}</Link> : <span className="font-medium">{item.name}</span>}<p className="text-xs text-muted-foreground">{item.memberCount} memberships</p></div>
      {user.role !== "viewer" && <><Button variant="ghost" size="sm" onClick={() => setEditing(item)}>Edit</Button>{kind === "tag" && <Button variant="ghost" size="sm" onClick={() => { setMerging(item); setTarget("") }}>Merge</Button>}<Button variant="ghost" size="sm" onClick={() => { setDeleting(item); setRemoveMembers(false) }}>Delete</Button></>}
    </div>)}</div>}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}><DialogContent><DialogHeader><DialogTitle>{editing === "new" ? "Add" : "Edit"} {kind}</DialogTitle><DialogDescription>{kind === "tag" ? "Tag names are stored in lowercase." : "People can belong to more than one group."}</DialogDescription></DialogHeader>{editing && <TaxonomyForm key={editing === "new" ? "new" : editing.id} kind={kind} item={editing === "new" ? undefined : editing} onSave={async () => { setEditing(null); await refresh() }} />}</DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogDescription>This {kind} has {deleting?.memberCount} memberships. Deleting it removes those associations and retains activity history.</DialogDescription></DialogHeader>{kind === "group" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeMembers} onChange={(event) => setRemoveMembers(event.target.checked)} />Remove all memberships, including archived people</label>}<Button variant="destructive" disabled={busy || (kind === "group" && Boolean(deleting?.memberCount) && !removeMembers)} onClick={async () => { if (!deleting) return; setBusy(true); try { await deleteTaxonomy({ data: { kind, id: deleting.id, removeMembers } }); setDeleting(null); await refresh() } catch { toast.error("Unable to delete. Check memberships and try again.") } finally { setBusy(false) } }}>Delete {kind}</Button></DialogContent></Dialog>
    <Dialog open={Boolean(merging)} onOpenChange={(open) => { if (!open) setMerging(null) }}><DialogContent><DialogHeader><DialogTitle>Merge {merging?.name}</DialogTitle><DialogDescription>Move all usages into the selected tag, then delete the source tag. Existing memberships are deduplicated.</DialogDescription></DialogHeader><select aria-label="Target tag" className="h-9 rounded-md border bg-background px-3" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Choose target tag</option>{items?.filter((item) => item.id !== merging?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button disabled={!target || busy} onClick={async () => { if (!merging) return; setBusy(true); try { await mergeTags({ data: { sourceId: merging.id, targetId: target } }); setMerging(null); await refresh() } catch { toast.error("Unable to merge these tags.") } finally { setBusy(false) } }}>Merge tags</Button></DialogContent></Dialog>
  </Workspace>
}

function TaxonomyForm({ kind, item, onSave }: { kind: "group" | "tag"; item?: Item; onSave: () => Promise<void> }) {
  const defaultValues: z.input<typeof taxonomyInput> = { kind, id: item?.id, name: item?.name ?? "", color: item?.color ?? "#2563eb", description: item?.description ?? "" }
  const form = useForm({ defaultValues, validators: { onSubmit: taxonomyInput }, onSubmit: async ({ value }) => {
    try { await saveTaxonomy({ data: value }); await onSave() } catch { toast.error("Unable to save. Check that the name is unique.") }
  } })
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
    <form.Field name="name">{(field) => <div className="space-y-2"><Label htmlFor="taxonomy-name">Name</Label><Input id="taxonomy-name" required maxLength={100} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} /></div>}</form.Field>
    <form.Field name="color">{(field) => <div className="space-y-2"><Label htmlFor="taxonomy-color">Color</Label><Input id="taxonomy-color" type="color" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} /></div>}</form.Field>
    {kind === "group" && <form.Field name="description">{(field) => <div className="space-y-2"><Label htmlFor="taxonomy-description">Description</Label><Input id="taxonomy-description" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} /></div>}</form.Field>}
    <form.Subscribe selector={(state) => state.isSubmitting}>{(busy) => <Button type="submit" disabled={busy}>Save {kind}</Button>}</form.Subscribe>
  </form>
}
