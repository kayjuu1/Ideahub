import { Link } from "@tanstack/react-router"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "../auth/client"

export const Route = createFileRoute("/login")({ component: Login })

const loginSchema = z.object({ email: z.email("Enter a valid email address."), password: z.string().min(1, "Enter your password.") })

function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setError("")
      try {
        const result = await authClient.signIn.email(value)
        if (result.error) {
          setError("Unable to sign in. Check your credentials or contact an administrator.")
          return
        }
        await navigate({ to: "/" })
      } catch {
        setError("Unable to connect. Please try again.")
      }
    },
  })

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <section className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3 font-semibold"><span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">IG</span>IdeaGap</div>
        <h1 className="font-heading text-2xl font-semibold">Sign in to your workspace</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">People, partners, and the relationships behind them.</p>
        <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }} className="space-y-4">
          <form.Field name="email">{(field) => (
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <input id="email" type="email" autoComplete="username" required value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}</form.Field>
          <form.Field name="password">{(field) => (
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <input id="password" type="password" autoComplete="current-password" required value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}</form.Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <form.Subscribe selector={(state) => state.isSubmitting}>{(submitting) => <Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>}</form.Subscribe>
        </form>
        <Link to="/forgot-password" className="mt-4 block text-sm text-primary">Forgot password or setting up your account?</Link>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Access is by invitation only. Contact your administrator if you need an account or help signing in.</p>
      </section>
    </main>
  )
}
