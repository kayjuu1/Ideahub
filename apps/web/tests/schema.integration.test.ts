import { readFile, readdir } from "node:fs/promises"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { drizzle } from "drizzle-orm/d1"
import { afterAll, beforeAll, expect, it } from "vitest"
import { people } from "../src/db/schema"
import { logActivity } from "../src/db/activity.server"

let worker: Miniflare
let database: Awaited<ReturnType<Miniflare["getD1Database"]>>

beforeAll(async () => {
  worker = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: "export default { fetch() { return new Response('test'); } }",
    compatibilityDate: "2026-09-22", d1Databases: ["DB"],
  }))
  database = await worker.getD1Database("DB")
  for (const file of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    const statements = (await readFile(`drizzle/${file}`, "utf8")).split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)
    await database.batch(statements.map((statement) => database.prepare(statement)))
  }
  await database.prepare("INSERT INTO user(id,name,email,role) VALUES ('author','Author','author@example.test','editor')").run()
})
afterAll(async () => { await worker?.dispose() })

it("enforces foreign keys", async () => {
  await expect(database.prepare("INSERT INTO people(id,name,created_by,created_at,updated_at) VALUES ('bad','Bad','missing',1,1)").run()).rejects.toThrow()
  expect((await database.prepare("PRAGMA foreign_key_check").all()).results).toEqual([])
})
it("commits a person and activity together", async () => {
  const db = drizzle(database)
  await db.batch([
    db.insert(people).values({ id: "person-1", name: "Ama", createdBy: "author", createdAt: new Date(), updatedAt: new Date() }),
    logActivity(db, { actorId: "author", action: "created", entityType: "person", entityId: "person-1" }),
  ])
  expect((await database.prepare("SELECT count(*) AS n FROM activity_log WHERE entity_id='person-1'").first<{ n: number }>())?.n).toBe(1)
})
it("rolls back the person if audit insertion fails", async () => {
  const db = drizzle(database)
  await expect(db.batch([
    db.insert(people).values({ id: "person-2", name: "Fail", createdBy: "author", createdAt: new Date(), updatedAt: new Date() }),
    logActivity(db, { actorId: "missing", action: "created", entityType: "person", entityId: "person-2" }),
  ])).rejects.toThrow()
  expect(await database.prepare("SELECT id FROM people WHERE id='person-2'").first()).toBeNull()
})
it("rejects mutation or deletion of historical activity", async () => {
  await expect(database.prepare("UPDATE activity_log SET action='tampered'").run()).rejects.toThrow()
  await expect(database.prepare("DELETE FROM activity_log").run()).rejects.toThrow()
})
it("enforces status and lowercase tag constraints", async () => {
  await expect(database.prepare("UPDATE people SET status='unknown' WHERE id='person-1'").run()).rejects.toThrow()
  await expect(database.prepare("INSERT INTO tags(id,name,color,created_at) VALUES ('bad','UPPER','#000000',1)").run()).rejects.toThrow()
})
it("permits vault tombstones while preserving immutable access history", async () => {
  await database.prepare("INSERT INTO vault_entries(id,label,key_version,created_by,created_at,updated_at,deleted_at) VALUES ('deleted-entry','Deleted entry',1,'author',1,1,1)").run()
  await database.prepare("INSERT INTO vault_access_log(id,entry_id,actor_id,action,created_at) VALUES ('entry-log','deleted-entry','author','delete',1)").run()
  await expect(database.prepare("UPDATE vault_access_log SET action='copy'").run()).rejects.toThrow()
  await expect(database.prepare("DELETE FROM vault_access_log").run()).rejects.toThrow()
  await expect(database.prepare("DELETE FROM vault_entries WHERE id='deleted-entry'").run()).rejects.toThrow()
})
