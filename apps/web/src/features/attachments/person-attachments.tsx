import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { deleteAttachment, downloadAttachment, listAttachments, uploadAttachment } from "./attachments.functions"
import { fileExtensions, MAX_FILE_SIZE } from "./validation"

export function PersonAttachments({ personId, editable }: { personId: string; editable: boolean }) {
  const cache = useQueryClient(), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState<{ id: string; filename: string } | null>(null)
  const query = useQuery({ queryKey: ["attachments", personId], queryFn: () => listAttachments({ data: { personId } }) })
  async function refresh() { await Promise.all([cache.invalidateQueries({ queryKey: ["attachments", personId] }), cache.invalidateQueries({ queryKey: ["timeline", personId] })]) }
  async function upload(file?: File) {
    if (!file || busy) return
    if (file.size > MAX_FILE_SIZE) { toast.error("Files must be 10 MB or smaller."); return }
    setBusy(true)
    try { const data = new FormData(); data.set("personId", personId); data.set("file", file); await uploadAttachment({ data }); await refresh(); toast.success("Attachment uploaded") }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to upload this file.") }
    finally { setBusy(false) }
  }
  return <section className="mt-6 max-w-3xl rounded-lg border bg-card p-6"><h2 className="mb-4 font-semibold">Attachments</h2>
    {editable && <div className="mb-4 rounded-md border border-dashed p-5 text-sm" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]) }}><label className="block font-medium" htmlFor="attachment-file">Drop a file here or choose one</label><p className="mb-3 text-xs text-muted-foreground">PDF, Word, Excel, CSV and images · maximum 10 MB per file</p><input id="attachment-file" type="file" disabled={busy} accept={fileExtensions.map((extension) => `.${extension}`).join(",")} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = "" }} />{busy && <p className="mt-2" role="status">Saving attachment…</p>}</div>}
    {query.isPending ? <Skeleton className="h-24" /> : query.isError ? <p role="alert">Unable to load attachments.</p> : !query.data.length ? <p className="text-sm text-muted-foreground">No attachments yet — add a relevant document or image.</p> : <ul className="divide-y">{query.data.map((file) => <li key={file.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.filename}</p><p className="text-xs text-muted-foreground">{(file.sizeBytes / 1024).toFixed(1)} KB · {file.uploader} · {new Date(file.createdAt).toLocaleDateString()}</p></div>{editable && <><Button variant="ghost" size="sm" disabled={busy} onClick={async () => { try { const response = await downloadAttachment({ data: { personId, id: file.id } }); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch { toast.error("Unable to download this attachment.") } }}>Download</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(file)}>Delete</Button></>}</li>)}</ul>}
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.filename}?</DialogTitle><DialogDescription>This permanently removes the stored file. Its audit history is retained.</DialogDescription></DialogHeader><Button variant="destructive" disabled={busy} onClick={async () => { if (!deleting) return; setBusy(true); try { await deleteAttachment({ data: { personId, id: deleting.id } }); setDeleting(null); await refresh(); toast.success("Attachment deleted") } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to delete this file.") } finally { setBusy(false) } }}>Delete attachment</Button></DialogContent></Dialog>
  </section>
}
