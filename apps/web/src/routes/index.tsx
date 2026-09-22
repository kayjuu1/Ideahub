import { createFileRoute, Link } from "@tanstack/react-router"
import { Workspace } from "../components/workspace"
import { loadIdentity } from "../auth/route-access"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { getDashboard } from "../features/dashboard/dashboard.functions"
import { activityLabel } from "../lib/activity-display"

export const Route = createFileRoute("/")({ beforeLoad: loadIdentity, component: App })

function App() {
  const { user } = Route.useRouteContext()
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() })
  return <Workspace name={user.name}>
    <div className="mb-7 flex items-end justify-between"><div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">IdeaGap relationships</p><h1 className="font-heading text-3xl font-semibold">Overview</h1></div><Link to="/people" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open people</Link></div>
    {query.isPending ? <><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="mt-6 h-80" /></> : query.isError ? <p role="alert">Unable to load the overview. Refresh to try again.</p> : <>
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">{([ ["Total people", query.data.counts.total], ["Active", query.data.counts.active], ["Paused", query.data.counts.paused], ["Alumni", query.data.counts.alumni], ["Organizations", query.data.counts.organizations] ] as const).map(([label, value]) => <div key={label} className="rounded-lg border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-heading text-3xl font-semibold tabular-nums">{value}</p></div>)}</div>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_2fr]"><section className="rounded-lg border bg-card p-5"><h2 className="mb-4 font-semibold">People by group</h2>{query.data.groups.length ? <ul className="divide-y">{query.data.groups.map((group) => <li key={group.id}><Link to="/groups/$groupId" params={{ groupId: group.id }} className="flex items-center gap-3 py-3 text-sm hover:text-primary"><span className="size-2 rounded-full" style={{ backgroundColor: group.color }} />{group.name}<span className="ml-auto tabular-nums text-muted-foreground">{group.count}</span></Link></li>)}</ul> : <p className="text-sm text-muted-foreground">No groups yet — create one to organize your contacts.</p>}</section>
      <section className="rounded-lg border bg-card p-5"><h2 className="mb-4 font-semibold">Recent activity</h2>{query.data.activity.length ? <ol className="divide-y">{query.data.activity.map((event) => <li key={event.id} className="py-3"><a href={event.href} className="text-sm hover:text-primary"><span className="font-medium">{event.actor}</span> {activityLabel(event.entityType, event.action)}{event.entityType === "note" || event.entityType === "attachment" ? " on" : ":"} <span className="font-medium">{event.name}</span>{event.action.includes("group_") || event.action.includes("tag_") ? ` (${event.detail ?? ""})` : ""}</a><p className="mt-1 text-xs text-muted-foreground"><time dateTime={new Date(event.createdAt).toISOString()} title={new Date(event.createdAt).toLocaleString()}>{relativeTime(new Date(event.createdAt))}</time></p></li>)}</ol> : <p className="text-sm text-muted-foreground">No people yet — add your first contact to start the relationship history.</p>}</section></div>
    </>}
  </Workspace>
}

function relativeTime(date: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}
