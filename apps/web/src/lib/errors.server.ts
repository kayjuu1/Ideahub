import { setResponseStatus } from "@tanstack/react-start/server"
import { AppError } from "./app-error"

export function fail(status: AppError["status"], message: string): never {
  setResponseStatus(status)
  throw new AppError(status, message)
}
