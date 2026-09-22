import { createFileRoute, Link } from "@tanstack/react-router"
import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { authClient } from "../auth/client"

export const Route = createFileRoute("/reset-password")({ validateSearch: z.object({ token: z.string().max(200).optional(), error: z.string().max(200).optional() }), component: ResetPassword })
function ResetPassword() {
  const { token, error } = Route.useSearch(), [message, setMessage] = useState(""), [complete, setComplete] = useState(false)
  const form = useForm({ defaultValues: { password: "", confirm: "" }, validators: { onSubmit: z.object({ password: z.string().min(12).max(256), confirm: z.string() }).refine((value) => value.password === value.confirm, "Passwords must match.") }, onSubmit: async ({ value }) => {
    if (!token) return
    const result = await authClient.resetPassword({ token, newPassword: value.password })
    if (result.error) setMessage("Unable to reset. The link may be expired or already used.")
    else { form.reset(); window.history.replaceState(null, "", "/reset-password"); setComplete(true) }
  } })
  return <main className="mx-auto mt-24 max-w-md rounded-lg border bg-card p-8"><h1 className="mb-4 text-2xl font-semibold">Set your password</h1>{complete ? <p>Password saved. You can now sign in.</p> : !token || error ? <p>This link is invalid or expired. Request a new password reset.</p> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}><p className="text-sm text-muted-foreground">Use at least 12 characters. Existing sessions will be revoked.</p>{(["password", "confirm"] as const).map((name) => <form.Field key={name} name={name}>{(field) => <Input type="password" autoComplete="new-password" aria-label={name === "password" ? "New password" : "Confirm password"} placeholder={name === "password" ? "New password" : "Confirm password"} minLength={12} maxLength={256} required value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}</form.Field>)}<form.Subscribe selector={(state) => ({ busy: state.isSubmitting, errors: state.errors })}>{({ busy, errors }) => <>{errors.length > 0 && <p role="alert" className="text-sm text-destructive">Use at least 12 characters and make sure the passwords match.</p>}<Button disabled={busy}>Save password</Button></>}</form.Subscribe></form>}{message && <p role="alert" className="mt-3 text-sm text-destructive">{message}</p>}<div className="mt-5 flex gap-4 text-sm text-primary"><Link to="/login">Sign in</Link><Link to="/forgot-password">Request new link</Link></div></main>
}
