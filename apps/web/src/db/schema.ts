import { sql } from "drizzle-orm"
import { blob, check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { session, user } from "./auth-schema"

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" })
const createdAt = () => timestamp("created_at").notNull()
const updatedAt = () => timestamp("updated_at").notNull()
const actor = (name: string) => text(name).notNull().references(() => user.id)

export const people = sqliteTable("people", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email"), phone: text("phone"),
  organization: text("organization"), rolePosition: text("role_position"),
  status: text("status", { enum: ["active", "paused", "alumni"] }).notNull().default("active"),
  notesSummary: text("notes_summary"), createdBy: actor("created_by"),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("people_status_idx").on(table.status), index("people_deleted_at_idx").on(table.deletedAt),
  index("people_organization_idx").on(table.organization),
  check("people_status_check", sql`${table.status} IN ('active','paused','alumni')`),
])

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(), name: text("name").notNull().unique(), description: text("description"),
  color: text("color").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
})
export const peopleGroups = sqliteTable("people_groups", {
  personId: text("person_id").notNull().references(() => people.id),
  groupId: text("group_id").notNull().references(() => groups.id),
  addedBy: actor("added_by"), addedAt: timestamp("added_at").notNull(),
}, (table) => [primaryKey({ columns: [table.personId, table.groupId] }), index("people_groups_group_idx").on(table.groupId)])

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(), name: text("name").notNull().unique(), color: text("color").notNull(), createdAt: createdAt(),
}, (table) => [check("tags_lowercase_check", sql`${table.name} = lower(trim(${table.name})) AND length(${table.name}) > 0`)])
export const peopleTags = sqliteTable("people_tags", {
  personId: text("person_id").notNull().references(() => people.id),
  tagId: text("tag_id").notNull().references(() => tags.id),
}, (table) => [primaryKey({ columns: [table.personId, table.tagId] }), index("people_tags_tag_idx").on(table.tagId)])

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(), personId: text("person_id").notNull().references(() => people.id),
  authorId: actor("author_id"), content: text("content").notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(), deletedAt: timestamp("deleted_at"),
}, (table) => [index("notes_person_created_idx").on(table.personId, table.createdAt)])

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(), personId: text("person_id").notNull().references(() => people.id), uploadedBy: actor("uploaded_by"),
  filename: text("filename").notNull(), contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(),
  r2Key: text("r2_key").notNull().unique(), createdAt: createdAt(),
})

export const entityTypes = ["person", "group", "tag", "note", "attachment", "vault", "user"] as const
export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(), actorId: actor("actor_id"), action: text("action").notNull(),
  entityType: text("entity_type", { enum: entityTypes }).notNull(), entityId: text("entity_id").notNull(),
  metadata: text("metadata").notNull(), createdAt: createdAt(),
}, (table) => [
  index("activity_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
  index("activity_created_idx").on(table.createdAt),
  check("activity_metadata_json_check", sql`json_valid(${table.metadata})`),
  check("activity_entity_type_check", sql`${table.entityType} IN ('person','group','tag','note','attachment','vault','user')`),
])

export const vaultEntries = sqliteTable("vault_entries", {
  id: text("id").primaryKey(), label: text("label").notNull(), username: text("username"), url: text("url"), category: text("category"),
  ciphertext: blob("ciphertext", { mode: "buffer" }), iv: blob("iv", { mode: "buffer" }), wrappedDek: blob("wrapped_dek", { mode: "buffer" }),
  keyVersion: integer("key_version").notNull(), createdBy: actor("created_by"),
  createdAt: createdAt(), updatedAt: updatedAt(), lastRotatedAt: timestamp("last_rotated_at"), deletedAt: timestamp("deleted_at"),
}, (table) => [check("vault_secret_or_tombstone_check", sql`(${table.deletedAt} IS NULL AND ${table.ciphertext} IS NOT NULL AND ${table.iv} IS NOT NULL AND ${table.wrappedDek} IS NOT NULL) OR (${table.deletedAt} IS NOT NULL AND ${table.ciphertext} IS NULL AND ${table.iv} IS NULL AND ${table.wrappedDek} IS NULL)` )])

export const vaultAccessLog = sqliteTable("vault_access_log", {
  id: text("id").primaryKey(), entryId: text("entry_id").notNull().references(() => vaultEntries.id), actorId: actor("actor_id"),
  action: text("action", { enum: ["reveal", "copy", "create", "update", "delete"] }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"), createdAt: createdAt(),
}, (table) => [index("vault_access_created_idx").on(table.createdAt), check("vault_access_action_check", sql`${table.action} IN ('reveal','copy','create','update','delete')`)])

export const vaultReauth = sqliteTable("vault_reauth", {
  sessionId: text("session_id").primaryKey().references(() => session.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at").notNull(),
})

// Operational sliding-window counters, not audit history. Old counters may be
// pruned; every accepted attempt is inserted with an atomic conditional query.
export const requestLimits = sqliteTable("request_limits", {
  id: text("id").primaryKey(), actorId: actor("actor_id"), scope: text("scope").notNull(), createdAt: createdAt(),
}, (table) => [index("request_limits_scope_actor_time_idx").on(table.scope, table.actorId, table.createdAt)])
