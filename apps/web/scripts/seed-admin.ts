import { randomBytes } from "node:crypto"
import { emitKeypressEvents } from "node:readline"
import { parseArgs } from "node:util"
import { getPlatformProxy } from "wrangler"
import { z } from "zod"
import { createAuth } from "../src/auth/create-auth"

async function passwordInput(): Promise<string> {
  if (process.env.SEED_ADMIN_PASSWORD) return process.env.SEED_ADMIN_PASSWORD
  if (!process.stdin.isTTY) throw new Error("Use an interactive terminal or supply SEED_ADMIN_PASSWORD securely through the process environment.")
  process.stdout.write("Admin password (hidden): ")
  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let password = ""
    const finish = () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener("keypress", listener)
      process.stdout.write("\n")
    }
    const listener = (character: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        finish()
        reject(new Error("Cancelled."))
        return
      }
      if (key.name === "return") {
        finish()
        resolve(password)
        return
      }
      if (key.name === "backspace") password = password.slice(0, -1)
      else if (character && !key.ctrl && character >= " ") password += character
    }
    process.stdin.on("keypress", listener)
  })
}

const { values } = parseArgs({
  options: {
    email: { type: "string" }, name: { type: "string" }, remote: { type: "boolean", default: false },
    env: { type: "string" },
    "generate-password": { type: "boolean", default: false },
  }, strict: true,
})
if (values.remote && !values.env) throw new Error("Remote bootstrap requires an explicit --env with a remote D1 binding.")
if (!values.remote && values.env) throw new Error("Use --remote with --env; local bootstrap uses the default local database.")
const input = z.object({ email: z.email(), name: z.string().trim().min(1), password: z.string().min(12) }).parse({
  email: values.email,
  name: values.name,
  password: values["generate-password"] ? randomBytes(32).toString("base64url") : await passwordInput(),
})
const platform = await getPlatformProxy<Env>({
  configPath: new URL("../wrangler.jsonc", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
  environment: values.remote ? values.env : undefined,
  persist: { path: new URL("../.wrangler/state/v3", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") },
  remoteBindings: values.remote,
})
try {
  // Authorized operator-only bootstrap exception; never exposed as an endpoint.
  const existing = await platform.env.DB.prepare("SELECT id FROM user WHERE role = 'admin' LIMIT 1").first()
  if (existing) throw new Error("An admin already exists. Use authenticated user management instead.")
  const auth = createAuth(platform.env.DB, randomBytes(48).toString("base64url"), "http://localhost:3000")
  await auth.api.createUser({ body: { ...input, role: "admin", data: { emailVerified: true } } })
  const login = await auth.api.signInEmail({ body: { email: input.email, password: input.password } })
  if (login.user.id === undefined || !login.token) throw new Error("Bootstrap login verification failed.")
  await platform.env.DB.prepare("DELETE FROM session WHERE token = ?").bind(login.token).run()
  console.log(`Admin created in ${values.remote ? `remote ${values.env}` : "local D1"}; login verified; test session revoked. Password was not logged.`)
  if (values["generate-password"]) console.log("Generated password discarded. Complete the email password-reset flow before first use.")
} finally {
  input.password = ""
  await platform.dispose()
}
