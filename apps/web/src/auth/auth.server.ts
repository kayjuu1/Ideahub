import { env } from "cloudflare:workers"
import { createAuth } from "./create-auth"

export function getAuth() {
  const secret = process.env.BETTER_AUTH_SECRET
  const baseURL = process.env.BETTER_AUTH_URL
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error("Authentication is not configured. Contact the administrator.")
  }
  return createAuth(env.DB, secret, baseURL)
}
