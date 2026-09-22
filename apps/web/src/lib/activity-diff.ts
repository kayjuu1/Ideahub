type FieldValue = string | number | boolean | null

export function diffFields<T extends Record<string, FieldValue>>(before: T, after: T) {
  const changes: Record<string, { old: FieldValue; new: FieldValue }> = {}
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) changes[key] = { old: before[key], new: after[key] }
  }
  return changes
}
