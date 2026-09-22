import { randomBytes } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { hashPassword } from "better-auth/crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { fromCrossJSON, toJSON } from "seroval"
import { z } from "zod"

// Exercise the compiled Worker, real Better Auth cookies, and the complete
// server-function middleware chain against isolated Miniflare D1.
describe("authentication boundary (compiled Worker + D1)", () => {
  let worker: Miniflare
  let workerOptions: Parameters<typeof convertV4MiniflareOptions>[0]
  let database: Awaited<ReturnType<Miniflare["getD1Database"]>>
  const cookies = new Map<string, string>()
  const functions = new Map<string, string>()
  const password = randomBytes(24).toString("base64url")
  const initialVaultKey = randomBytes(32).toString("base64")

  beforeAll(async () => {
    const assets = resolve("dist/server/assets")
    for (const filename of await readdir(assets)) {
      if (!filename.includes("server-fn-resolver") || !filename.endsWith(".js")) continue
      const source = await readFile(resolve(assets, filename), "utf8")
      for (const match of source.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"(\w+)_createServerFn_handler"/g)) {
        functions.set(match[2], match[1])
      }
    }
    expect([...functions.keys()].sort()).toEqual(["createPerson", "deletePerson", "getAdminAccess", "getCurrentUser", "getPeopleFilters", "getPerson", "listPeople", "updatePerson", "listTaxonomy", "getMemberships", "saveTaxonomy", "deleteTaxonomy", "mergeTags", "changeMembership", "changePeopleStatus", "listNotes", "getTimeline", "createNote", "updateNote", "deleteNote", "listAttachments", "uploadAttachment", "downloadAttachment", "deleteAttachment", "getDashboard", "listManagedUsers", "createManagedUser", "changeManagedRole", "setManagedBan", "resetManagedPassword", "listVault", "createVaultEntry", "updateVaultEntry", "deleteVaultEntry", "revealVaultSecret", "reauthenticateVault", "listVaultAccess", "rewrapVaultKeys"].sort())
    workerOptions = {
      modules: [
        { type: "ESModule", path: resolve("dist/server/index.js") },
        ...(await readdir(assets)).filter((name) => name.endsWith(".js")).map((name) => ({ type: "ESModule" as const, path: resolve(assets, name) })),
      ],
      modulesRoot: resolve("dist/server"),
      compatibilityDate: "2026-09-22",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      r2Buckets: ["ATTACHMENTS"],
      email: { send_email: [{ name: "EMAIL", allowed_sender_addresses: ["noreply@ideagap.org"], allowed_destination_addresses: ["invited@example.test", "target@example.test"] }] },
      bindings: { BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"), BETTER_AUTH_URL: "http://localhost", VAULT_MASTER_KEY: initialVaultKey },
    }
    worker = new Miniflare(convertV4MiniflareOptions(workerOptions))
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
    for (const role of ["admin", "editor", "viewer"]) {
      await database.prepare("INSERT INTO notes(id,person_id,author_id,content,created_at,updated_at) VALUES (?,'person-viewer',?,'Fixture note',1,1)").bind(`note-${role}`, role).run()
      const key = `people/person-viewer/attachment-${role}/fixture.pdf`
      await (await worker.getR2Bucket("ATTACHMENTS")).put(key, "%PDF-1.7\nfixture")
      await database.prepare("INSERT INTO attachments(id,person_id,uploaded_by,filename,content_type,size_bytes,r2_key,created_at) VALUES (?,'person-viewer',?,'fixture.pdf','application/pdf',16,?,1)").bind(`attachment-${role}`, role, key).run()
    }
    await database.batch([
      database.prepare("INSERT INTO user(id,name,email,email_verified,role,created_at,updated_at) VALUES ('managed-target','Managed Target','target@example.test',1,'viewer',1,1)"),
      database.prepare("INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('managed-account','managed-target','credential','managed-target',?,1,1)").bind(hash),
    ])
  }, 60_000)

  afterAll(async () => { await worker?.dispose() })

  async function call(name: string, role?: string, data?: unknown, method = "GET") {
    const id = functions.get(name)
    if (!id) throw new Error(`Missing compiled function: ${name}`)
    const multipart = data instanceof FormData
    const payload = multipart ? "" : JSON.stringify(toJSON({ data }))
    const formRequest = multipart ? new Request("http://localhost", { method: "POST", body: data }) : undefined
    const body = formRequest ? new Uint8Array(await formRequest.arrayBuffer()) : payload
    return worker.dispatchFetch(`http://localhost/_serverFn/${id}${method === "GET" ? `?payload=${encodeURIComponent(payload)}` : ""}`, {
      method,
      body: method === "POST" ? body : undefined,
      headers: { "Content-Type": formRequest?.headers.get("Content-Type") ?? "application/json", Cookie: role ? cookies.get(role) ?? "" : "", "x-tsr-serverFn": "true", Origin: "http://localhost", "Sec-Fetch-Site": "same-origin" },
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
  const noteCalls = [
    { name: "listNotes", write: false }, { name: "getTimeline", write: false },
    { name: "createNote", write: true }, { name: "updateNote", write: true }, { name: "deleteNote", write: true },
  ]
  for (const endpoint of noteCalls) {
    for (const role of ["admin", "editor", "viewer"]) {
      it(`${role} permission for ${endpoint.name}`, async () => {
        expect((await call(endpoint.name, role, { personId: "person-viewer", id: `note-${role}`, content: "New **note**" }, endpoint.write ? "POST" : "GET")).status).toBe(endpoint.write && role === "viewer" ? 403 : 200)
      })
    }
    it(`anonymous cannot call ${endpoint.name}`, async () => {
      expect((await call(endpoint.name, undefined, { personId: "person-viewer", id: "note-viewer", content: "Blocked" }, endpoint.write ? "POST" : "GET")).status).toBe(401)
    })
  }
  it("editors cannot change another author's notes; admins can", async () => {
    const data = { personId: "person-viewer", id: "note-viewer", content: "Admin correction" }
    for (const endpoint of ["updateNote", "deleteNote"]) expect((await call(endpoint, "editor", data, "POST")).status).toBe(403)
    expect((await call("updateNote", "admin", data, "POST")).status).toBe(200)
    expect((await call("deleteNote", "admin", data, "POST")).status).toBe(200)
    expect(await (await call("listNotes", "viewer", { personId: "person-viewer" })).text()).not.toContain("Admin correction")
    expect((await call("listNotes", "viewer", { personId: "person-admin" })).status).toBe(404)
  })
  it("timeline contains creation, field diffs, membership and note events newest first", async () => {
    expect((await call("createPerson", "editor", { ...profile, name: "Timeline contact" }, "POST")).status).toBe(200)
    const person = await database.prepare("SELECT id FROM people WHERE name='Timeline contact'").first<{ id: string }>()
    expect(person).not.toBeNull()
    const personId = person!.id
    expect((await call("updatePerson", "editor", { ...profile, name: "Timeline contact", status: "active", id: personId }, "POST")).status).toBe(200)
    expect((await call("changeMembership", "editor", { personIds: [personId], kind: "group", targetId: "group-editor" }, "POST")).status).toBe(200)
    expect((await call("createNote", "editor", { personId, content: "Timeline note" }, "POST")).status).toBe(200)
    const response = await call("getTimeline", "viewer", { personId })
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain("group_added")
    expect(body).toContain("changes")
    const events = await database.prepare("SELECT action FROM activity_log WHERE entity_id=? OR json_extract(metadata,'$.personId')=? ORDER BY created_at DESC,id DESC").bind(personId, personId).all<{ action: string }>()
    expect(events.results.map((row) => row.action)).toEqual(["added", "group_added", "updated", "created"])
  })
  function uploadData(filename = "upload.pdf", content = "%PDF-1.7\nattachment\n%%EOF") {
    const data = new FormData()
    data.set("personId", "person-viewer")
    data.set("file", new File([content], filename))
    return data
  }
  for (const name of ["listAttachments", "uploadAttachment", "downloadAttachment", "deleteAttachment"]) {
    const method = ["uploadAttachment", "deleteAttachment"].includes(name) ? "POST" : "GET"
    for (const role of ["admin", "editor", "viewer"]) {
      it(`${role} permission for ${name}`, async () => {
        const data = name === "uploadAttachment" ? uploadData() : { personId: "person-viewer", id: `attachment-${role}` }
        expect((await call(name, role, data, method)).status).toBe(role === "viewer" && name !== "listAttachments" ? 403 : 200)
      })
    }
    it(`anonymous cannot call ${name}`, async () => {
      expect((await call(name, undefined, name === "uploadAttachment" ? uploadData() : { personId: "person-viewer", id: "attachment-viewer" }, method)).status).toBe(401)
    })
  }
  it("uploads, lists, streams and deletes an attachment and its R2 object", async () => {
    const content = "%PDF-1.7\nround trip\n%%EOF"
    expect((await call("uploadAttachment", "editor", uploadData("roundtrip.pdf", content), "POST")).status).toBe(200)
    const file = await database.prepare("SELECT id,r2_key FROM attachments WHERE filename='roundtrip.pdf'").first<{ id: string; r2_key: string }>()
    expect(file).not.toBeNull()
    const key = { personId: "person-viewer", id: file!.id }
    const response = await call("downloadAttachment", "editor", key)
    expect(response.headers.get("Content-Disposition")).toContain("attachment")
    expect(response.headers.get("Cache-Control")).toContain("no-store")
    expect(await response.text()).toBe(content)
    expect(await (await call("listAttachments", "viewer", { personId: "person-viewer" })).text()).toContain("roundtrip.pdf")
    expect((await call("downloadAttachment", "admin", { ...key, personId: "person-admin" })).status).toBe(404)
    expect((await call("deleteAttachment", "editor", key, "POST")).status).toBe(200)
    expect(await (await worker.getR2Bucket("ATTACHMENTS")).get(file!.r2_key)).toBeNull()
    expect(await database.prepare("SELECT id FROM attachments WHERE id=?").bind(file!.id).first()).toBeNull()
  })
  it("rejects invalid files clearly and compensates R2 after a D1 failure", async () => {
    const invalid = await call("uploadAttachment", "editor", uploadData("fake.png", "MZ not an image"), "POST")
    expect(invalid.status).toBe(415)
    expect(await invalid.text()).toContain("extension")
    expect((await call("uploadAttachment", "editor", uploadData("script.exe"), "POST")).status).toBe(415)
    const oversized = uploadData()
    oversized.set("file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf"))
    const large = await call("uploadAttachment", "admin", oversized, "POST")
    expect(large.status).toBe(413)
    expect(await large.text()).toContain("10 MB")
    const bucket = await worker.getR2Bucket("ATTACHMENTS"), before = (await bucket.list()).objects.length
    await database.prepare("CREATE TRIGGER fail_attachment_test BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'test rollback'); END").run()
    try { expect((await call("uploadAttachment", "admin", uploadData("rollback.pdf"), "POST")).status).toBe(503) }
    finally { await database.prepare("DROP TRIGGER fail_attachment_test").run() }
    expect((await bucket.list()).objects.length).toBe(before)
  })
  it("retains a retry handle when the row cannot be deleted after R2 succeeds", async () => {
    const data = { personId: "person-viewer", id: "attachment-viewer" }
    await database.prepare("CREATE TRIGGER fail_attachment_delete BEFORE DELETE ON attachments BEGIN SELECT RAISE(ABORT, 'test rollback'); END").run()
    try { expect((await call("deleteAttachment", "admin", data, "POST")).status).toBe(503) }
    finally { await database.prepare("DROP TRIGGER fail_attachment_delete").run() }
    expect(await database.prepare("SELECT id FROM attachments WHERE id='attachment-viewer'").first()).not.toBeNull()
    expect((await call("deleteAttachment", "admin", data, "POST")).status).toBe(200)
    expect(await database.prepare("SELECT id FROM attachments WHERE id='attachment-viewer'").first()).toBeNull()
  })
  for (const role of ["admin", "editor", "viewer"]) {
    it(`${role} can call getDashboard`, async () => { expect((await call("getDashboard", role)).status).toBe(200) })
  }
  it("anonymous cannot call getDashboard", async () => { expect((await call("getDashboard")).status).toBe(401) })
  it("dashboard matches direct SQL and every feed link resolves", async () => {
    const response = await call("getDashboard", "viewer")
    const transport = await response.json() as Parameters<typeof fromCrossJSON>[0]
    const decoded: unknown = fromCrossJSON(transport, { refs: new Map() })
    const result = z.object({ result: z.object({ counts: z.object({ total: z.number(), active: z.number(), paused: z.number(), alumni: z.number(), organizations: z.number() }), groups: z.array(z.object({ id: z.string(), count: z.number() })), activity: z.array(z.object({ href: z.string(), entityType: z.string() })) }) }).parse(decoded).result
    const totals = await database.prepare("SELECT count(*) AS total, coalesce(sum(status='active'),0) AS active, coalesce(sum(status='paused'),0) AS paused, coalesce(sum(status='alumni'),0) AS alumni, count(distinct nullif(lower(trim(organization)),'')) AS organizations FROM people WHERE deleted_at IS NULL").first()
    expect(result.counts).toEqual(totals)
    for (const group of result.groups) {
      const count = await database.prepare("SELECT count(*) AS n FROM people_groups pg JOIN people p ON p.id=pg.person_id WHERE pg.group_id=? AND p.deleted_at IS NULL").bind(group.id).first<{ n: number }>()
      expect(group.count).toBe(count?.n)
    }
    expect(result.activity).toHaveLength(10)
    for (const event of result.activity) {
      expect(["vault", "user"]).not.toContain(event.entityType)
      const page = await worker.dispatchFetch(`http://localhost${event.href}`, { headers: { Cookie: cookies.get("viewer") ?? "" } })
      expect(page.status).toBe(200)
    }
  })
  const adminCalls = [
    { name: "listManagedUsers", method: "GET", data: undefined },
    { name: "createManagedUser", method: "POST", data: { name: "Invited Editor", email: "invited@example.test", role: "editor" } },
    { name: "changeManagedRole", method: "POST", data: { userId: "managed-target", role: "editor" } },
    { name: "setManagedBan", method: "POST", data: { userId: "managed-target", banned: true, reason: "Test ban" } },
    { name: "resetManagedPassword", method: "POST", data: { userId: "managed-target" } },
  ]
  for (const endpoint of adminCalls) {
    for (const role of ["admin", "editor", "viewer"]) {
      it(`${role} permission for ${endpoint.name}`, async () => {
        expect((await call(endpoint.name, role, endpoint.data, endpoint.method)).status).toBe(role === "admin" ? 200 : 403)
      })
    }
    it(`anonymous cannot call ${endpoint.name}`, async () => {
      expect((await call(endpoint.name, undefined, endpoint.data, endpoint.method)).status).toBe(401)
    })
  }
  it("blocks self-demotion and self-ban before changing the account", async () => {
    expect((await call("changeManagedRole", "admin", { userId: "admin", role: "viewer" }, "POST")).status).toBe(403)
    expect((await call("setManagedBan", "admin", { userId: "admin", banned: true }, "POST")).status).toBe(403)
    const row = await database.prepare("SELECT role,banned FROM user WHERE id='admin'").first<{ role: string; banned: number | null }>()
    expect(row?.role).toBe("admin")
    expect(row?.banned).toBeFalsy()
    expect((await call("setManagedBan", "admin", { userId: "managed-target", banned: false }, "POST")).status).toBe(200)
  })
  it("invitation password setup is single-use and the new editor has editor permissions", async () => {
    const row = await database.prepare("SELECT id,email_delivery_status FROM user WHERE email='invited@example.test'").first<{ id: string; email_delivery_status: string }>()
    expect(row?.email_delivery_status).toBe("sent")
    const reset = await database.prepare("SELECT identifier,expires_at FROM verification WHERE value=? AND identifier LIKE 'reset-password:%'").bind(row!.id).first<{ identifier: string; expires_at: number }>()
    expect(reset!.expires_at - Date.now()).toBeGreaterThan(23 * 3600 * 1000)
    const token = reset!.identifier.slice("reset-password:".length)
    const payload = JSON.stringify({ token, newPassword: password })
    const options = { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: payload }
    expect((await worker.dispatchFetch("http://localhost/api/auth/reset-password", options)).status).toBe(200)
    expect((await worker.dispatchFetch("http://localhost/api/auth/reset-password", options)).status).toBe(400)
    await database.prepare("DELETE FROM rate_limit").run()
    const login = await worker.dispatchFetch("http://localhost/api/auth/sign-in/email", { ...options, body: JSON.stringify({ email: "invited@example.test", password }) })
    expect(login.status).toBe(200)
    cookies.set("invited", login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; "))
    expect((await call("createPerson", "invited", { ...profile, name: "Invited editor's contact" }, "POST")).status).toBe(200)
    for (const endpoint of adminCalls) expect((await call(endpoint.name, "invited", endpoint.data, endpoint.method)).status).toBe(403)
    expect((await database.prepare("SELECT last_sign_in_at FROM user WHERE id=?").bind(row!.id).first<{ last_sign_in_at: number }>())!.last_sign_in_at).toBeGreaterThan(0)
    expect((await call("resetManagedPassword", "admin", { userId: row!.id }, "POST")).status).toBe(200)
    expect((await call("getCurrentUser", "invited")).status).toBe(401)
  })
  it("records delivery failure for retry without exposing tokens or account existence", async () => {
    // Remove the email binding to model a real delivery/configuration failure;
    // Miniflare's email simulator does not enforce recipient restrictions.
    await worker.setOptions(convertV4MiniflareOptions({ ...workerOptions, email: { send_email: [] } }))
    database = await worker.getD1Database("DB")
    try {
    const response = await call("createManagedUser", "admin", { name: "Failed delivery", email: "blocked-recipient@example.test", role: "viewer" }, "POST")
    expect(response.status).toBe(200)
    const transport = await response.json() as Parameters<typeof fromCrossJSON>[0]
    const result = z.object({ result: z.object({ id: z.string(), emailSent: z.boolean() }) }).parse(fromCrossJSON(transport, { refs: new Map() })).result
    expect(result.emailSent).toBe(false)
    expect((await database.prepare("SELECT email_delivery_status FROM user WHERE id=?").bind(result.id).first<{ email_delivery_status: string }>())?.email_delivery_status).toBe("failed")
    const options = { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify({ email: "blocked-recipient@example.test", redirectTo: "http://localhost/reset-password" }) }
    const existing = await worker.dispatchFetch("http://localhost/api/auth/request-password-reset", options)
    const missing = await worker.dispatchFetch("http://localhost/api/auth/request-password-reset", { ...options, body: JSON.stringify({ email: "missing@example.test", redirectTo: "http://localhost/reset-password" }) })
    expect(existing.status).toBe(200)
    expect(missing.status).toBe(200)
    expect(await existing.json()).toEqual(await missing.json())
    } finally { await worker.setOptions(convertV4MiniflareOptions(workerOptions)); database = await worker.getD1Database("DB") }
  })
  const vaultProfile = { label: "Vault fixture", username: "test", category: "testing", url: "https://example.test", secret: "Never logged fixture secret" }
  let vaultId = "", deleteVaultId = ""
  it("creates encrypted fixtures with atomic audit records", async () => {
    for (const label of ["Vault fixture", "Delete fixture"]) {
      expect((await call("createVaultEntry", "admin", { ...vaultProfile, label }, "POST")).status).toBe(200)
      const row = await database.prepare("SELECT id,hex(ciphertext) AS ciphertext,length(wrapped_dek) AS wrapped FROM vault_entries WHERE label=?").bind(label).first<{ id: string; ciphertext: string; wrapped: number }>()
      expect(row?.wrapped).toBe(60)
      expect(row?.ciphertext).not.toContain(Buffer.from(vaultProfile.secret).toString("hex").toUpperCase())
      if (label === "Vault fixture") vaultId = row!.id; else deleteVaultId = row!.id
      expect((await database.prepare("SELECT count(*) AS n FROM vault_access_log WHERE entry_id=? AND action='create'").bind(row!.id).first<{ n: number }>())?.n).toBe(1)
    }
  })
  for (const name of ["listVault", "createVaultEntry", "updateVaultEntry", "deleteVaultEntry", "revealVaultSecret", "reauthenticateVault", "listVaultAccess", "rewrapVaultKeys"]) {
    for (const role of ["admin", "editor", "viewer", "anonymous"]) {
      it(`${role} permission for ${name}`, async () => {
        const method = ["listVault", "listVaultAccess"].includes(name) ? "GET" : "POST"
        const data = name === "reauthenticateVault" ? { password } : name === "listVaultAccess" ? { page: 0 } : name === "createVaultEntry" ? { ...vaultProfile, label: "Matrix entry" } : { ...vaultProfile, id: name === "deleteVaultEntry" ? deleteVaultId : vaultId }
        const expected = role === "anonymous" ? 401 : role === "viewer" || role === "editor" && !["listVault", "revealVaultSecret", "reauthenticateVault"].includes(name) ? 403 : 200
        const response = await call(name, role === "anonymous" ? undefined : role, data, method)
        expect(response.status).toBe(expected)
        if (name === "revealVaultSecret" && expected === 200) { expect(await response.text()).toBe(vaultProfile.secret); expect(response.headers.get("Cache-Control")).toContain("no-store") }
      })
    }
  }
  it("blocks every vault page for viewers and anonymous requests", async () => {
    for (const path of ["/vault", "/vault/anything"]) {
      expect((await worker.dispatchFetch(`http://localhost${path}`, { headers: { Cookie: cookies.get("viewer")! } })).status).toBe(403)
      expect((await worker.dispatchFetch(`http://localhost${path}`)).status).toBe(401)
    }
  })
  it("never returns encrypted fields or plaintext in metadata, and erases deleted ciphertext", async () => {
    const metadata = await (await call("listVault", "editor")).text()
    for (const forbidden of [vaultProfile.secret, "ciphertext", "wrappedDek", "Delete fixture"]) expect(metadata).not.toContain(forbidden)
    const deleted = await database.prepare("SELECT ciphertext,iv,wrapped_dek,deleted_at FROM vault_entries WHERE id=?").bind(deleteVaultId).first<{ ciphertext: unknown; iv: unknown; wrapped_dek: unknown; deleted_at: number }>()
    expect(deleted?.ciphertext).toBeNull(); expect(deleted?.iv).toBeNull(); expect(deleted?.wrapped_dek).toBeNull(); expect(deleted?.deleted_at).toBeGreaterThan(0)
    expect((await call("revealVaultSecret", "admin", { id: deleteVaultId }, "POST")).status).toBe(404)
  })
  it("requires fresh password confirmation for old sessions and rate limits password attempts", async () => {
    await database.prepare("UPDATE session SET created_at=? WHERE user_id='editor'").bind(Date.now() - 16 * 60000).run()
    await database.prepare("DELETE FROM vault_reauth WHERE session_id IN (SELECT id FROM session WHERE user_id='editor')").run()
    await database.prepare("DELETE FROM request_limits WHERE actor_id='editor'").run()
    expect((await call("revealVaultSecret", "editor", { id: vaultId }, "POST")).status).toBe(403)
    expect((await call("reauthenticateVault", "editor", { password: "incorrect password" }, "POST")).status).toBe(403)
    expect((await call("reauthenticateVault", "editor", { password }, "POST")).status).toBe(200)
    expect((await call("revealVaultSecret", "editor", { id: vaultId, action: "copy" }, "POST")).status).toBe(200)
    for (let n = 0; n < 3; n++) expect((await call("reauthenticateVault", "editor", { password: "incorrect password" }, "POST")).status).toBe(403)
    expect((await call("reauthenticateVault", "editor", { password }, "POST")).status).toBe(429)
  })
  it("atomically limits concurrent reveals to ten and audits every returned value", async () => {
    await database.prepare("DELETE FROM request_limits WHERE actor_id='admin'").run()
    const before = (await database.prepare("SELECT count(*) AS n FROM vault_access_log WHERE actor_id='admin' AND action='reveal'").first<{ n: number }>())!.n
    const responses = await Promise.all(Array.from({ length: 12 }, () => call("revealVaultSecret", "admin", { id: vaultId }, "POST")))
    expect(responses.filter((response) => response.status === 200)).toHaveLength(10)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(2)
    const after = (await database.prepare("SELECT count(*) AS n FROM vault_access_log WHERE actor_id='admin' AND action='reveal'").first<{ n: number }>())!.n
    expect(after - before).toBe(10)
    await database.prepare("DELETE FROM request_limits WHERE actor_id='admin'").run()
  })
  it("refuses to reveal when the audit write fails", async () => {
    await database.prepare("CREATE TRIGGER test_audit_failure BEFORE INSERT ON vault_access_log WHEN NEW.action='reveal' BEGIN SELECT RAISE(ABORT,'fixture'); END").run()
    try { const response = await call("revealVaultSecret", "admin", { id: vaultId }, "POST"); expect(response.status).toBe(500); expect(await response.text()).not.toContain(vaultProfile.secret) }
    finally { await database.prepare("DROP TRIGGER test_audit_failure").run() }
  })
  it("rotates master keys without changing secret ciphertext", async () => {
    const before = await database.prepare("SELECT hex(ciphertext) AS ciphertext FROM vault_entries WHERE id=?").bind(vaultId).first<{ ciphertext: string }>()
    const oldBindings = workerOptions.bindings ?? {}
    const rotated = { ...workerOptions, bindings: { ...oldBindings, VAULT_MASTER_KEY: randomBytes(32).toString("base64"), VAULT_KEY_VERSION: "2", VAULT_PREVIOUS_MASTER_KEYS: JSON.stringify({ "1": initialVaultKey }) } }
    await worker.setOptions(convertV4MiniflareOptions(rotated)); database = await worker.getD1Database("DB")
    expect((await call("rewrapVaultKeys", "admin", undefined, "POST")).status).toBe(200)
    const after = await database.prepare("SELECT hex(ciphertext) AS ciphertext,key_version FROM vault_entries WHERE id=?").bind(vaultId).first<{ ciphertext: string; key_version: number }>()
    expect(after?.ciphertext).toBe(before?.ciphertext); expect(after?.key_version).toBe(2)
    expect(await (await call("revealVaultSecret", "admin", { id: vaultId }, "POST")).text()).toBe(vaultProfile.secret)
    workerOptions = rotated
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
