import { expect, it } from "vitest"
import { diffFields } from "../src/lib/activity-diff"

it("records only changed fields including null and empty transitions", () => {
  expect(diffFields({ name: "Ama", phone: null, organization: "" }, { name: "Ama", phone: "123", organization: null })).toEqual({
    phone: { old: null, new: "123" }, organization: { old: "", new: null },
  })
})
it("does not emit a diff for an unchanged profile", () => {
  expect(diffFields({ name: "Ama" }, { name: "Ama" })).toEqual({})
})
