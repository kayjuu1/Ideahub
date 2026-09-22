import { createServerFn } from "@tanstack/react-start"
import { protectedFn } from "../../auth/middleware"
import { createVaultInput, revealVaultInput, updateVaultInput, vaultId, vaultLogInput, vaultPassword } from "./validation"

export const listVault = createServerFn({ method: "GET" }).middleware([protectedFn("editor")]).handler(async ({ context }) => {
  const service = await import("./vault.server")
  return service.list(context.db, context.identity)
})
export const createVaultEntry = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).validator(createVaultInput).handler(async ({ context, data }) => {
  const service = await import("./vault.server")
  return service.create(context.db, context.identity, data)
})
export const updateVaultEntry = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).validator(updateVaultInput).handler(async ({ context, data }) => {
  const service = await import("./vault.server")
  return service.update(context.db, context.identity, data)
})
export const deleteVaultEntry = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).validator(vaultId).handler(async ({ context, data }) => {
  const service = await import("./vault.server")
  return service.remove(context.db, context.identity, data.id)
})
export const revealVaultSecret = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(revealVaultInput).handler(async ({ context, data }) => {
  const service = await import("./vault.server")
  return service.reveal(context.db, context.identity, data)
})
export const reauthenticateVault = createServerFn({ method: "POST" }).middleware([protectedFn("editor")]).validator(vaultPassword).handler(async ({ context, data }) => {
  const service = await import("./vault.server")
  return service.reauthenticate(context.db, context.identity, data.password)
})
export const listVaultAccess = createServerFn({ method: "GET" }).middleware([protectedFn("admin")]).validator(vaultLogInput).handler(async ({ context, data }) => {
  const service = await import("./vault.server")
  return service.accessLog(context.db, data.page)
})
export const rewrapVaultKeys = createServerFn({ method: "POST" }).middleware([protectedFn("admin")]).handler(async ({ context }) => {
  const service = await import("./vault.server")
  return service.rewrap(context.db, context.identity)
})
