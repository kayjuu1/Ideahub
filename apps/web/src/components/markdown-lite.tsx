import { Fragment } from "react"

// Render text as React nodes. HTML is never interpreted; only http(s) links
// become anchors, preventing script/data URLs even in persisted notes.
export function MarkdownLite({ content }: { content: string }) {
  return <div className="space-y-1 whitespace-pre-wrap break-words text-sm">{content.split("\n").map((line, index) => <p key={index}>{line.startsWith("- ") ? <>• {inline(line.slice(2))}</> : inline(line)}</p>)}</div>
}
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part)
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline">{link[1]}</a>
    return <Fragment key={index}>{part}</Fragment>
  })
}
