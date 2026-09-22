import { useForm } from "@tanstack/react-form"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "sonner"
import { emptyPerson, personInput } from "./validation"
import type { PersonInput } from "./validation"

export function PersonForm({ initial = emptyPerson, onSave, onCancel }: { initial?: PersonInput; onSave: (input: PersonInput) => Promise<void>; onCancel: () => void }) {
  const form = useForm({ defaultValues: initial, validators: { onSubmit: personInput }, onSubmit: async ({ value }) => {
    try { await onSave(value) } catch { toast.error("Unable to save this person. Reload the record and try again.") }
  } })
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
    <div className="grid gap-4 sm:grid-cols-2">
      {([ ["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["organization", "Organization"], ["rolePosition", "Role / position"] ] as const).map(([name, label]) => <form.Field name={name} key={name}>{(field) => <div className="space-y-1.5">
        <Label htmlFor={name}>{label}{name === "name" ? " *" : ""}</Label>
        <Input id={name} value={field.state.value} type={name === "email" ? "email" : "text"} required={name === "name"} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
        {field.state.meta.errors.map((error, index) => <p key={index} role="alert" className="text-xs text-destructive">{error?.message}</p>)}
      </div>}</form.Field>)}
      <form.Field name="status">{(field) => <div className="space-y-1.5"><Label htmlFor="status">Status</Label><select id="status" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={field.state.value} onChange={(event) => field.handleChange(personInput.shape.status.parse(event.target.value))}><option value="active">Active</option><option value="paused">Paused</option><option value="alumni">Alumni</option></select></div>}</form.Field>
    </div>
    <form.Field name="notesSummary">{(field) => <div className="space-y-1.5"><Label htmlFor="summary">Summary</Label><Textarea id="summary" maxLength={1000} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} /></div>}</form.Field>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><form.Subscribe selector={(state) => state.isSubmitting}>{(busy) => <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save person"}</Button>}</form.Subscribe></div>
  </form>
}
