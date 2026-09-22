import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { MarkdownLite } from "../../components/markdown-lite"
import { createNote, deleteNote, listNotes, updateNote } from "./notes.functions"
import { noteInput } from "./validation"
import type { Role } from "../../auth/policy"

type Note = Awaited<ReturnType<typeof listNotes>>[number]
export function PersonNotes({ personId, user }: { personId: string; user: { id: string; role: Role } }) {
  const cache = useQueryClient(), [page, setPage] = useState(0), [editing, setEditing] = useState<Note | null>(null), [deleting, setDeleting] = useState<Note | null>(null), [busy, setBusy] = useState(false)
  const key = ["notes", personId, page], query = useQuery({ queryKey: key, queryFn: () => listNotes({ data: { personId, page } }) })
  async function refresh() { await Promise.all([cache.invalidateQueries({ queryKey: ["notes", personId] }), cache.invalidateQueries({ queryKey: ["timeline", personId] })]) }
  async function save(content: string) {
    if (!editing) { await createNote({ data: { personId, content } }); await refresh(); toast.success("Note added"); return }
    await cache.cancelQueries({ queryKey: key })
    const previous = cache.getQueryData<Note[]>(key)
    cache.setQueryData<Note[]>(key, (rows) => rows?.map((row) => row.id === editing.id ? { ...row, content } : row))
    try { await updateNote({ data: { id: editing.id, personId, content } }); setEditing(null); toast.success("Note updated") }
    catch (error) { cache.setQueryData(key, previous); throw error }
    finally { await refresh() }
  }
  return <section className="mt-6 max-w-3xl rounded-lg border bg-card p-6"><h2 className="mb-4 font-semibold">Notes</h2>
    {user.role !== "viewer" && !editing && <NoteForm key={personId} personId={personId} save={save} />}
    {query.isPending ? <Skeleton className="mt-4 h-32" /> : query.isError ? <p role="alert">Unable to load notes.</p> : !query.data.length ? <p className="mt-4 text-sm text-muted-foreground">No notes yet — record your first interaction.</p> : <div className="mt-5 divide-y">{query.data.map((note) => <article key={note.id} className="py-4"><div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-muted font-medium">{note.author.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span>{note.author}</span><time dateTime={new Date(note.createdAt).toISOString()}>{new Date(note.createdAt).toLocaleString()}</time>{(user.role === "admin" || user.role === "editor" && note.authorId === user.id) && <div className="ml-auto flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(note)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(note)}>Delete</Button></div>}</div>{editing?.id === note.id ? <NoteForm key={note.id} personId={personId} initial={note.content} save={save} cancel={() => setEditing(null)} /> : <MarkdownLite content={note.content} />}</article>)}</div>}
    <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="ghost" disabled={query.data?.length !== 50} onClick={() => setPage(page + 1)}>Next</Button></div>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete note?</DialogTitle><DialogDescription>The note will be hidden. Its audit history is retained.</DialogDescription></DialogHeader><Button variant="destructive" disabled={busy} onClick={async () => { if (!deleting) return; setBusy(true); try { await deleteNote({ data: { id: deleting.id, personId } }); setDeleting(null); await refresh(); toast.success("Note deleted") } catch { toast.error("Unable to delete this note. Refresh and try again.") } finally { setBusy(false) } }}>Delete note</Button></DialogContent></Dialog>
  </section>
}
function NoteForm({ personId, initial = "", save, cancel }: { personId: string; initial?: string; save: (content: string) => Promise<void>; cancel?: () => void }) {
  const form = useForm({ defaultValues: { personId, content: initial }, validators: { onSubmit: noteInput }, onSubmit: async ({ value }) => { try { await save(value.content); form.reset() } catch { toast.error("Unable to save this note. Check your permission and try again.") } } })
  return <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }} className="space-y-2"><form.Field name="content">{(field) => <Textarea aria-label="Note content" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} required maxLength={20000} rows={4} placeholder="Record an interaction. Supports **bold**, *italic*, links and lists." />}</form.Field><div className="flex gap-2"><form.Subscribe selector={(state) => state.isSubmitting}>{(submitting) => <Button type="submit" disabled={submitting}>{cancel ? "Save note" : "Add note"}</Button>}</form.Subscribe>{cancel && <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>}</div></form>
}
