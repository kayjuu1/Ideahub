import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { activityLabel, activityMetadata } from "../../lib/activity-display"
import { getTimeline } from "./notes.functions"

export function PersonTimeline({ personId }: { personId: string }) {
  const [page, setPage] = useState(0)
  const query = useQuery({ queryKey: ["timeline", personId, page], queryFn: () => getTimeline({ data: { personId, page } }) })
  return <section className="mt-6 max-w-3xl rounded-lg border bg-card p-6"><h2 className="mb-4 font-semibold">Timeline</h2>{query.isPending ? <Skeleton className="h-40" /> : query.isError ? <p role="alert">Unable to load activity.</p> : !query.data.length ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : <ol className="divide-y">{query.data.map((event) => {
    const metadata = activityMetadata(event.metadata)
    return <li key={event.id} className="py-3 text-sm"><p><span className="font-medium">{event.actor}</span> {activityLabel(event.entityType, event.action)}{metadata.name ? `: ${metadata.name}` : ""}</p><time className="text-xs text-muted-foreground" dateTime={new Date(event.createdAt).toISOString()}>{new Date(event.createdAt).toLocaleString()}</time>{metadata.changes && <dl className="mt-2 space-y-1 text-xs text-muted-foreground">{Object.entries(metadata.changes).map(([field, change]) => <div key={field}><dt className="inline font-medium">{field}: </dt><dd className="inline">{String(change.old ?? "—")} → {String(change.new ?? "—")}</dd></div>)}</dl>}</li>
  })}</ol>}<div className="mt-4 flex justify-end gap-2"><Button variant="ghost" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="ghost" disabled={query.data?.length !== 50} onClick={() => setPage(page + 1)}>Next</Button></div></section>
}
