import { setResponseStatus } from "@tanstack/react-start/server"
import { AppError } from "./app-error"

export function fail(status: 400 | 403 | 404 | 409 | 413 | 429, message: string): never {
  setResponseStatus(status)
  throw new AppError(status, message)
}
