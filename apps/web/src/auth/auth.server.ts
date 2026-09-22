import { env } from "cloudflare:workers"
import { createAuth } from "./create-auth"
import { sendPasswordEmail } from "./email.server"

export function getAuth(options: { actorId?: string; invitation?: boolean } = {}) {
  const secret = process.env.BETTER_AUTH_SECRET
  const baseURL = process.env.BETTER_AUTH_URL
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error("Authentication is not configured. Contact the administrator.")
  }
  return createAuth(env.DB, secret, baseURL, { ...options, sendReset: sendPasswordEmail })
}
