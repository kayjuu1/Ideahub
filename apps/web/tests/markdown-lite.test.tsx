import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MarkdownLite } from "../src/components/markdown-lite"

describe("note rendering", () => {
  it("escapes HTML and leaves unsafe links as text", () => {
    const html = renderToStaticMarkup(<MarkdownLite content={'<script>alert(1)</script> [bad](javascript:alert) [bad](data:text/html,hi)'} />)
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("href=")
    expect(html).toContain("&lt;script&gt;")
  })
  it("renders supported emphasis, links and list markers", () => {
    const html = renderToStaticMarkup(<MarkdownLite content={'**bold** *italic* [site](https://example.test)\n- Item'} />)
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<em>italic</em>")
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain("• Item")
  })
})
