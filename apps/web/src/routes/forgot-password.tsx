import { createFileRoute, Link } from "@tanstack/react-router"
import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { authClient } from "../auth/client"

export const Route = createFileRoute("/forgot-password")({ component: ForgotPassword })
function ForgotPassword() {
  const [message, setMessage] = useState("")
  const form = useForm({ defaultValues: { email: "" }, onSubmit: async ({ value }) => { const result = await authClient.requestPasswordReset({ email: value.email, redirectTo: `${window.location.origin}/reset-password` }); setMessage(result.error ? "Unable to request a reset. Wait a moment and try again." : "If an account exists, check your email for a password setup link.") } })
  return <main className="mx-auto mt-24 max-w-md rounded-lg border bg-card p-8"><h1 className="mb-3 text-2xl font-semibold">Reset your password</h1><p className="mb-5 text-sm text-muted-foreground">Enter your account email to request a single-use setup link.</p><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}><form.Field name="email">{(field) => <Input type="email" aria-label="Account email" placeholder="you@ideagap.org" required value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}</form.Field><form.Subscribe selector={(state) => state.isSubmitting}>{(busy) => <Button disabled={busy}>Send reset link</Button>}</form.Subscribe></form>{message && <p role="status" className="mt-4 text-sm">{message}</p>}<Link to="/login" className="mt-5 block text-sm text-primary">Back to sign in</Link></main>
}
