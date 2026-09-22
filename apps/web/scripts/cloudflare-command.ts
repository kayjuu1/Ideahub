import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import ts from "typescript"
import { z } from "zod"

const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { env: { type: "string" }, check: { type: "boolean", default: false } } })
const action = z.enum(["deploy", "migrate"]).parse(positionals[0])
if (!values.env || !/^[a-z][a-z0-9-]*$/.test(values.env)) throw new Error("Choose a configured remote environment explicitly: --env production")
const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", await readFile("wrangler.jsonc", "utf8"))
if (parsed.error) throw new Error("Cannot read wrangler.jsonc")
const config: unknown = parsed.config
const environment = z.object({ env: z.record(z.string(), z.unknown()) }).parse(config).env[values.env]
const binding = z.object({ name: z.string(), d1_databases: z.array(z.object({ binding: z.string(), database_id: z.uuid() })), r2_buckets: z.array(z.object({ binding: z.string(), bucket_name: z.string() })).optional(), send_email: z.array(z.object({ name: z.string() })).optional() }).safeParse(environment)
if (!binding.success) throw new Error(`Configure env.${values.env} in wrangler.jsonc before ${action}.`)
const database = binding.data.d1_databases.find((item) => item.binding === "DB")
if (!database || database.database_id === "00000000-0000-0000-0000-000000000000") throw new Error("A real remote D1 binding is required.")
if (action === "deploy" && (!binding.data.r2_buckets?.some((item) => item.binding === "ATTACHMENTS" && !item.bucket_name.includes("local")) || !binding.data.send_email?.some((item) => item.name === "EMAIL"))) throw new Error("Configure private ATTACHMENTS and EMAIL bindings for this environment before deployment.")
if (values.check) console.log(`Configuration check passed for ${values.env}; no remote operation performed.`)
else {
  async function run(command: string[], buildEnvironment = false) {
    const child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: { ...process.env, ...(buildEnvironment ? { CLOUDFLARE_ENV: values.env } : {}) } })
    const code = await child.exited
    if (code !== 0) process.exit(code)
  }
  if (action === "deploy") {
    // Vite selects Cloudflare bindings at BUILD time; deploy uses its output.
    await run(["bun", "run", "build"], true)
    await run(["bun", "run", "security:audit"])
    await run(["bunx", "--no-install", "wrangler", "deploy"])
  } else await run(["bunx", "--no-install", "wrangler", "d1", "migrations", "apply", "DB", "--remote", "--env", values.env])
}
