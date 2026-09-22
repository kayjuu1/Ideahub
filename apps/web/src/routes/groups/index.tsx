import { createFileRoute } from "@tanstack/react-router"
import { loadIdentity } from "../../auth/route-access"
import { TaxonomyPage } from "../../features/taxonomy/taxonomy-page"

export const Route = createFileRoute("/groups/")({ beforeLoad: loadIdentity, component: Page })
function Page() { return <TaxonomyPage kind="group" user={Route.useRouteContext().user} /> }
