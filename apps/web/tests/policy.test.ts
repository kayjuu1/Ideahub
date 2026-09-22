import { describe, expect, it } from "vitest"
import { AccessError, preventSelfLockout, requireRole } from "../src/auth/policy"
import type { Role } from "../src/auth/policy"

describe("role authorization", () => {
  const roles: Role[] = ["viewer", "editor", "admin"]
  for (const [actualIndex, actual] of roles.entries()) {
    for (const [minimumIndex, minimum] of roles.entries()) {
      it(`${actual} ${actualIndex >= minimumIndex ? "can" : "cannot"} use ${minimum} functions`, () => {
        if (actualIndex >= minimumIndex) expect(requireRole(actual, minimum)).toBe(actual)
        else expect(() => requireRole(actual, minimum)).toThrow(AccessError)
      })
    }
  }
  it.each([undefined, null, "owner", "admin,viewer", ""])('rejects unrecognized role %s', (role) => {
    expect(() => requireRole(role, "viewer")).toThrow(AccessError)
  })
  it("blocks self-demotion and self-ban", () => {
    expect(() => preventSelfLockout("admin-a", "admin-a")).toThrow(AccessError)
    expect(() => preventSelfLockout("admin-a", "admin-b")).not.toThrow()
  })
})
