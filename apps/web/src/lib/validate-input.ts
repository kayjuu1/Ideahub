import type { z } from "zod"

// Preserve typed inputs and ZodError identity instead of Start's standard-schema
// adapter serializing issue details into a generic Error message.
export function validateInput<T extends z.ZodType>(schema: T) {
  return (input: z.input<T>): z.output<T> => schema.parse(input)
}
