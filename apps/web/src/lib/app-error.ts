export class AppError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 413 | 429, message: string) {
    super(message)
    this.name = "AppError"
  }
}
