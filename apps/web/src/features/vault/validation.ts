import { z } from "zod"

export const vaultId = z.object({ id: z.string().min(1).max(64) })
export const vaultMetadata = z.object({ label: z.string().trim().min(1).max(150), username: z.string().trim().max(250), category: z.string().trim().max(100), url: z.string().trim().max(2000).refine((value) => !value || /^https?:\/\//i.test(value) && URL.canParse(value), "Use an http or https URL.") })
export const createVaultInput = vaultMetadata.extend({ secret: z.string().min(1).max(4096) })
export const updateVaultInput = vaultMetadata.extend({ id: vaultId.shape.id, secret: z.string().min(1).max(4096).optional() })
export const revealVaultInput = vaultId.extend({ action: z.enum(["reveal", "copy"]).default("reveal") })
export const vaultPassword = z.object({ password: z.string().min(1).max(256) })
export const vaultLogInput = z.object({ page: z.number().int().min(0).max(10000).default(0) })
