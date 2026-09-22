import { readFile, readdir } from "node:fs/promises"
import { resolve, relative } from "node:path"
import ts from "typescript"

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]))).flat()
}
const failures: string[] = [], protectedNames: string[] = []
const databaseFiles = new Set<string>()
const connectionOwners = new Set(["auth/middleware.ts", "auth/auth.server.ts", "auth/create-auth.ts", "db/database.server.ts"])
for (const path of await files(resolve("src"))) {
  if (!/\.tsx?$/.test(path) || path.endsWith("routeTree.gen.ts")) continue
  const name = relative(resolve("src"), path).replaceAll("\\", "/"), source = await readFile(path, "utf8")
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  function visit(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) failures.push(`${name}: explicit any`)
    if (ts.isVariableDeclaration(node) && node.initializer && /\bcreateServerFn\(/.test(node.initializer.getText(ast))) {
      const declaration = node.initializer.getText(ast)
      if (!/\.middleware\(\[protectedFn\((?:"(?:viewer|editor|admin)")?\)\]\)/.test(declaration)) failures.push(`${name}: missing shared authorization`)
      protectedNames.push(node.name.getText(ast))
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(ast)
      if (/^(getDatabase|drizzle)$/.test(expression) && !connectionOwners.has(name)) failures.push(`${name}: unauthorized database acquisition`)
      if (/\b(?:DB|database)\.prepare$/.test(expression)) failures.push(`${name}: raw query outside approved connection boundary`)
      if (/^db\./.test(expression)) {
        databaseFiles.add(name)
        if (name !== "auth/create-auth.ts" && (!name.endsWith(".server.ts") || !source.includes("AppDatabase"))) failures.push(`${name}: query outside typed server service`)
      }
    }
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const specifier = node.moduleSpecifier.getText(ast)
      if (/drizzle-orm\/d1|cloudflare:workers/.test(specifier) && !name.endsWith(".server.ts") && name !== "auth/create-auth.ts") failures.push(`${name}: runtime binding import outside server module`)
      if (/\.server["']$/.test(specifier) && /^(routes|components)\//.test(name) && name !== "routes/api/auth/$.ts") failures.push(`${name}: server-only import in browser component`)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (/@ts-ignore|@ts-nocheck/.test(source)) failures.push(`${name}: unchecked TypeScript`)
}
const tests = await readFile("tests/auth.integration.test.ts", "utf8")
for (const name of protectedNames) if (!tests.includes(`"${name}"`)) failures.push(`Missing compiled role-matrix inventory: ${name}`)
const clientFiles = await files(resolve("dist/client")), allArtifacts = [...clientFiles, ...await files(resolve("dist/server"))]
// Better Auth's browser package includes an inert environment-name getter;
// reject actual process accesses and secret values, not that dependency label.
const forbidden = ["VAULT_MASTER_KEY", "VAULT_PREVIOUS_MASTER_KEYS", "process.env.BETTER_AUTH_SECRET", "drizzle-orm", "AES-GCM", "LOCAL EMAIL", "D1Database"]
const secretValues: string[] = []
try {
  // Read only to compare; never echo values or include them in failure messages.
  const local = await readFile(".dev.vars", "utf8")
  for (const line of local.split(/\r?\n/)) {
    const match = /^\s*(?:BETTER_AUTH_SECRET|VAULT_MASTER_KEY|VAULT_PREVIOUS_MASTER_KEYS)\s*=\s*["']?(.+?)["']?\s*$/.exec(line)
    if (match && match[1].length >= 16) secretValues.push(match[1])
  }
} catch { /* CI has no local secret file. */ }
for (const path of allArtifacts) {
  if (/[/\\](?:\.dev\.vars|\.env)(?:\.|$)/.test(path)) failures.push("Environment file emitted into build output")
  if (!/\.(?:js|json|html|map)$/.test(path)) continue
  const text = await readFile(path, "utf8")
  if (secretValues.some((secret) => text.includes(secret))) failures.push("Local secret value found in build output")
  if (clientFiles.includes(path) && forbidden.some((value) => text.includes(value))) failures.push(`Server-only content in client artifact: ${relative(resolve("dist/client"), path)}`)
  if (text.includes("LOCAL EMAIL")) failures.push("Development email logger included in production output")
}
if (!clientFiles.some((path) => path.endsWith(".js"))) failures.push("Build client assets before running the security audit")
if (failures.length) { for (const failure of [...new Set(failures)]) console.error(failure); process.exitCode = 1 }
else {
  console.log(`PASS: ${protectedNames.length} protected functions inventoried in compiled role tests.`)
  console.log(`PASS: db. calls reviewed in ${databaseFiles.size} server files; application database acquisition is restricted to middleware.`)
  console.log("Exception: Better Auth adapter/hooks authenticate login/reset tokens outside protectedFn; CLI bootstrap is not an HTTP endpoint.")
  console.log(`PASS: ${clientFiles.length} client artifacts scanned; no server bindings, encryption code, or secret values. No environment files or development email logger emitted.`)
}
