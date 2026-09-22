import { randomBytes } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { hashPassword } from "better-auth/crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { toJSON } from "seroval"

// Exercise the compiled Worker, real Better Auth cookies, and the complete
// server-function middleware chain against isolated Miniflare D1.
describe("authentication boundary (compiled Worker + D1)", () => {
  let worker: Miniflare
  let database: Awaited<ReturnType<Miniflare["getD1Database"]>>
  const cookies = new Map<string, string>()
  const functions = new Map<string, string>()
  const password = randomBytes(24).toString("base64url")

  beforeAll(async () => {
    const assets = resolve("dist/server/assets")
    for (const filename of await readdir(assets)) {
      if (!filename.includes("server-fn-resolver") || !filename.endsWith(".js")) continue
      const source = await readFile(resolve(assets, filename), "utf8")
      for (const match of source.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"(\w+)_createServerFn_handler"/g)) {
        functions.set(match[2], match[1])
      }
    }
    expect([...functions.keys()].sort()).toEqual(["createPerson", "deletePerson", "getAdminAccess", "getCurrentUser", "getPeopleFilters", "getPerson", "listPeople", "updatePerson", "listTaxonomy", "getMemberships", "saveTaxonomy", "deleteTaxonomy", "mergeTags", "changeMembership", "changePeopleStatus"].sort())
    worker = new Miniflare(convertV4MiniflareOptions({
      modules: [
        { type: "ESModule", path: resolve("dist/server/index.js") },
        ...(await readdir(assets)).filter((name) => name.endsWith(".js")).map((name) => ({ type: "ESModule" as const, path: resolve(assets, name) })),
      ],
      modulesRoot: resolve("dist/server"),
      compatibilityDate: "2026-09-22",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      r2Buckets: ["ATTACHMENTS"],
      bindings: { BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"), BETTER_AUTH_URL: "http://localhost" },
    }))
    database = await worker.getD1Database("DB")
    for (const file of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = await readFile(resolve("drizzle", file), "utf8")
      const statements = sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)
      await database.batch(statements.map((statement) => database.prepare(statement)))
    }
    const hash = await hashPassword(password)
    const now = Date.now()
    for (const role of ["admin", "editor", "viewer"]) {
      await database.batch([
        database.prepare("INSERT INTO user (id,name,email,email_verified,role,created_at,updated_at) VALUES (?,?,?,1,?,?,?)").bind(role, `Test ${role}`, `${role}@example.test`, role, now, now),
        database.prepare("INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES (?,?,'credential',?,?,?,?)").bind(`account-${role}`, role, role, hash, now, now),
      ])
      const response = await worker.dispatchFetch("http://localhost/api/auth/sign-in/email", {
        method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({ email: `${role}@example.test`, password }),
      })
      expect(response.status, `seeded ${role} can sign in`).toBe(200)
      cookies.set(role, response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; "))
      expect(cookies.get(role)).toContain("session_token")
    }
    for (const role of ["admin", "editor", "viewer"]) {
      await database.prepare("INSERT INTO people(id,name,organization,status,created_by,created_at,updated_at) VALUES (?,?,'IdeaGap','active','admin',1,1)").bind(`person-${role}`, `Person ${role}`).run()
      await database.prepare("INSERT INTO groups(id,name,color,created_at,updated_at) VALUES (?,?,'#123456',1,1)").bind(`group-${role}`, `Group ${role}`).run()
      for (const prefix of ["source", "target", "delete"]) {
        await database.prepare("INSERT INTO tags(id,name,color,created_at) VALUES (?,?,'#123456',1)").bind(`${prefix}-${role}`, `${prefix}-${role}`).run()
      }
    }
  }, 60_000)

  afterAll(async () => { await worker?.dispose() })

  async function call(name: string, role?: string, data?: unknown, method = "GET") {
    const id = functions.get(name)
    if (!id) throw new Error(`Missing compiled function: ${name}`)
    const payload = JSON.stringify(toJSON({ data }))
    return worker.dispatchFetch(`http://localhost/_serverFn/${id}${method === "GET" ? `?payload=${encodeURIComponent(payload)}` : ""}`, {
      method,
      body: method === "POST" ? payload : undefined,
      headers: { "Content-Type": "application/json", Cookie: role ? cookies.get(role) ?? "" : "", "x-tsr-serverFn": "true", Origin: "http://localhost", "Sec-Fetch-Site": "same-origin" },
    })
  }

  for (const role of ["admin", "editor", "viewer"]) {
    it(`${role} can call getCurrentUser`, async () => {
      const response = await call("getCurrentUser", role)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(`${role}@example.test`)
    })
    it(`${role} ${role === "admin" ? "can" : "cannot"} call getAdminAccess`, async () => {
      expect((await call("getAdminAccess", role)).status).toBe(role === "admin" ? 200 : 403)
    })
  }
  it.each(["getCurrentUser", "getAdminAccess"])("anonymous cannot call %s", async (name) => {
    expect((await call(name)).status).toBe(401)
  })
  const profile = { name: "Updated person", email: "contact@example.test", phone: "", organization: "Partner Org", rolePosition: "Mentor", status: "paused", notesSummary: "A contact" }
  for (const role of ["admin", "editor", "viewer"]) {
    for (const name of ["listPeople", "getPeopleFilters", "getPerson"]) {
      it(`${role} can call ${name}`, async () => {
        const data = name === "getPerson" ? { id: `person-${role}` } : name === "listPeople" ? {} : undefined
        expect((await call(name, role, data)).status).toBe(200)
      })
    }
    for (const name of ["createPerson", "updatePerson", "deletePerson"]) {
      it(`${role} ${role === "viewer" ? "cannot" : "can"} call ${name}`, async () => {
        const data = name === "createPerson" ? profile : name === "updatePerson" ? { ...profile, id: `person-${role}` } : { id: `person-${role}` }
        expect((await call(name, role, data, "POST")).status).toBe(role === "viewer" ? 403 : 200)
      })
    }
  }
  for (const name of ["listPeople", "getPeopleFilters", "getPerson", "createPerson", "updatePerson", "deletePerson"]) {
    it(`anonymous cannot call ${name}`, async () => {
      const method = ["createPerson", "updatePerson", "deletePerson"].includes(name) ? "POST" : "GET"
      expect((await call(name, undefined, { ...profile, id: "person-viewer" }, method)).status).toBe(401)
    })
  }
  it("filters, paginates, and excludes deleted people from all reads", async () => {
    expect((await call("getPerson", "viewer", { id: "person-admin" })).status).toBe(404)
    const filtered = await call("listPeople", "viewer", { search: "PARTNER", status: "paused", pageSize: 1 })
    expect(filtered.status).toBe(200)
    const text = await filtered.text()
    expect(text).toContain("Updated person")
    expect(text).not.toContain("person-admin")
    expect(text).not.toContain("person-editor")
    const noMatches = await call("listPeople", "viewer", { search: "does-not-exist" })
    expect(await noMatches.text()).not.toContain("Updated person")
  })
  it("audits create, update diff, and deletion", async () => {
    const events = await database.prepare("SELECT action,metadata FROM activity_log WHERE entity_id='person-admin' ORDER BY created_at,id").all<{ action: string; metadata: string }>()
    expect(events.results.map((row) => row.action)).toEqual(["updated", "deleted"])
    expect(JSON.parse(events.results[0].metadata).changes.status).toEqual({ old: "active", new: "paused" })
  })
  const taxonomyCalls = [
    { name: "listTaxonomy", method: "GET", write: false, data: (_role: string) => undefined },
    { name: "getMemberships", method: "GET", write: false, data: (_role: string) => ({ personId: "person-viewer" }) },
    { name: "saveTaxonomy", method: "POST", write: true, data: (role: string) => ({ kind: "tag", name: `Created-${role}`, color: "#123456" }) },
    { name: "deleteTaxonomy", method: "POST", write: true, data: (role: string) => ({ kind: "tag", id: `delete-${role}` }) },
    { name: "mergeTags", method: "POST", write: true, data: (role: string) => ({ sourceId: `source-${role}`, targetId: `target-${role}` }) },
    { name: "changeMembership", method: "POST", write: true, data: (role: string) => ({ personIds: ["person-viewer"], kind: "group", targetId: `group-${role}` }) },
    { name: "changePeopleStatus", method: "POST", write: true, data: (_role: string) => ({ personIds: ["person-viewer"], status: "alumni" }) },
  ]
  for (const endpoint of taxonomyCalls) {
    for (const role of ["admin", "editor", "viewer"]) {
      it(`${role} permission for ${endpoint.name}`, async () => {
        expect((await call(endpoint.name, role, endpoint.data(role), endpoint.method)).status).toBe(endpoint.write && role === "viewer" ? 403 : 200)
      })
    }
    it(`anonymous cannot call ${endpoint.name}`, async () => {
      expect((await call(endpoint.name, undefined, endpoint.data("viewer"), endpoint.method)).status).toBe(401)
    })
  }
  it("keeps a person in multiple groups and audits only membership changes", async () => {
    const memberships = await database.prepare("SELECT group_id FROM people_groups WHERE person_id='person-viewer' ORDER BY group_id").all<{ group_id: string }>()
    expect(memberships.results.map((row) => row.group_id)).toEqual(["group-admin", "group-editor"])
    const data = { personIds: ["person-viewer"], kind: "group", targetId: "group-admin" }
    expect((await call("changeMembership", "editor", data, "POST")).status).toBe(200)
    const logs = await database.prepare("SELECT count(*) AS n FROM activity_log WHERE entity_id='person-viewer' AND action='group_added'").first<{ n: number }>()
    expect(logs?.n).toBe(2)
    expect((await call("deleteTaxonomy", "admin", { kind: "group", id: "group-admin" }, "POST")).status).toBe(409)
    expect((await call("deleteTaxonomy", "admin", { kind: "group", id: "group-admin", removeMembers: true }, "POST")).status).toBe(200)
  })
  it("merges overlapping tags without losing members or leaving orphans", async () => {
    await database.batch([
      database.prepare("INSERT INTO people_tags(person_id,tag_id) VALUES ('person-viewer','source-viewer'),('person-viewer','target-viewer'),('person-admin','source-viewer')"),
    ])
    expect((await call("mergeTags", "editor", { sourceId: "source-viewer", targetId: "target-viewer" }, "POST")).status).toBe(200)
    const members = await database.prepare("SELECT person_id FROM people_tags WHERE tag_id='target-viewer' ORDER BY person_id").all<{ person_id: string }>()
    expect(members.results.map((row) => row.person_id)).toEqual(["person-admin", "person-viewer"])
    expect(await database.prepare("SELECT id FROM tags WHERE id='source-viewer'").first()).toBeNull()
    expect((await database.prepare("PRAGMA foreign_key_check").all()).results).toEqual([])
  })
  it("deduplicates lowercase tags and excludes deleted people from membership reads", async () => {
    expect((await call("saveTaxonomy", "editor", { kind: "tag", name: "TARGET-VIEWER", color: "#123456" }, "POST")).status).toBe(200)
    expect((await database.prepare("SELECT count(*) AS n FROM tags WHERE name='target-viewer'").first<{ n: number }>())?.n).toBe(1)
    expect((await call("getMemberships", "viewer", { personId: "person-admin" })).status).toBe(404)
    expect((await call("changeMembership", "admin", { personIds: ["person-admin"], kind: "tag", targetId: "target-viewer" }, "POST")).status).toBe(404)
  })
  it.each(["sign-up/email", "admin/create-user", "admin/set-role", "admin/ban-user"])("rejects direct %s", async (path) => {
    const response = await worker.dispatchFetch(`http://localhost/api/auth/${path}`, {
      method: "POST", headers: { Cookie: cookies.get("admin") ?? "", "Content-Type": "application/json", Origin: "http://localhost" }, body: "{}",
    })
    expect(response.status).toBe(403)
  })
  it("rejects cross-origin login", async () => {
    await database.prepare("DELETE FROM rate_limit").run()
    const response = await worker.dispatchFetch("http://localhost/api/auth/sign-in/email", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" },
      body: JSON.stringify({ email: "admin@example.test", password }),
    })
    expect(response.status).toBe(403)
  })
  it("refreshes role from D1 and rejects an unknown role", async () => {
    await database.prepare("UPDATE user SET role='unknown' WHERE id='editor'").run()
    expect((await call("getCurrentUser", "editor")).status).toBe(403)
    await database.prepare("UPDATE user SET role='editor' WHERE id='editor'").run()
  })
  it("rejects a banned account on its next request", async () => {
    await database.prepare("UPDATE user SET banned=1 WHERE id='viewer'").run()
    expect([401, 403]).toContain((await call("getCurrentUser", "viewer")).status)
  })
  it("rejects a revoked session on its next request", async () => {
    await database.prepare("DELETE FROM session WHERE user_id='admin'").run()
    expect((await call("getAdminAccess", "admin")).status).toBe(401)
  })
})
