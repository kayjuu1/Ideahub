import { env } from "cloudflare:workers"
import type { ResetDelivery } from "./create-auth"

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char)
}
export async function sendPasswordEmail(message: ResetDelivery) {
  const subject = message.invitation ? "Your IdeaGap account invitation" : "Reset your IdeaGap password"
  const duration = message.invitation ? "24 hours" : "one hour"
  const text = `Hello ${message.name},\n\n${message.invitation ? "Your administrator created an IdeaGap account for you." : "A password reset was requested for your IdeaGap account."}\nSet your password: ${message.url}\n\nThis single-use link expires in ${duration}. If you did not expect this message, contact your administrator.`
  // Compiled out of production builds. Loopback is an additional guard against
  // accidentally treating a remotely configured development app as local mail.
  if (import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.BETTER_AUTH_URL ?? "http://invalid").hostname)) {
    console.info(`[LOCAL EMAIL — NOT SENT]\nTo: ${message.email}\nSubject: ${subject}\n\n${text}\n[/LOCAL EMAIL]`)
    return
  }
  await env.EMAIL.send({ from: { email: "noreply@ideagap.org", name: "IdeaGap" }, to: message.email, subject, text, html: `<p>Hello ${escapeHtml(message.name)},</p><p>${escapeHtml(subject)}.</p><p><a href="${escapeHtml(message.url)}">Set your password</a></p><p>This single-use link expires in ${duration}. If you did not expect this message, contact your administrator.</p>` })
}
