import { betterAuth } from "better-auth"
import { authOptions } from "./src/auth/options"

// CLI-only config. Generation uses --adapter drizzle --dialect sqlite.
export const auth = betterAuth(authOptions)
