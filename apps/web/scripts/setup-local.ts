import { randomBytes } from "node:crypto"
import { writeFile } from "node:fs/promises"

try {
  await writeFile(new URL("../.dev.vars", import.meta.url), [
    `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
    "BETTER_AUTH_URL=http://localhost:3000",
    "",
  ].join("\n"), { flag: "wx", mode: 0o600 })
  console.log("Created ignored local authentication configuration. No vault key was created.")
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.log("Existing local configuration preserved.")
  } else throw error
}
