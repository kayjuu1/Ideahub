import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@workspace/ui/components/command"
import { listPeople } from "../features/people/people.functions"

export function PeopleSearch() {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [debounced, setDebounced] = useState("")
  const navigate = useNavigate()
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((previous) => !previous) }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])
  useEffect(() => { const timer = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(timer) }, [search])
  const result = useQuery({ queryKey: ["people-search", debounced], queryFn: () => listPeople({ data: { search: debounced, pageSize: 10 } }), enabled: open })
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Search <kbd className="ml-3 text-xs text-muted-foreground">⌘ / Ctrl K</kbd></Button>
    <CommandDialog open={open} onOpenChange={setOpen} title="Find a person" description="Search your contacts by name, email, or organization."><Command shouldFilter={false}>
      <CommandInput placeholder="Find a person…" value={search} onValueChange={setSearch} />
      <CommandList><CommandEmpty>{result.isPending ? "Loading people…" : result.isError ? "Search is unavailable. Try again." : "No matching people."}</CommandEmpty>
        {result.data?.rows.map((person) => <CommandItem key={person.id} value={person.id} onSelect={() => { setOpen(false); void navigate({ to: "/people/$personId", params: { personId: person.id } }) }}><span>{person.name}</span><span className="ml-auto text-xs text-muted-foreground">{person.organization}</span></CommandItem>)}
      </CommandList>
    </Command></CommandDialog></>
}
