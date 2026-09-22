import { redirect } from "@tanstack/react-router"
import { getCurrentUser } from "./session.functions"

export async function loadIdentity() {
  try { return { user: await getCurrentUser() } }
  catch { throw redirect({ to: "/login" }) }
}
