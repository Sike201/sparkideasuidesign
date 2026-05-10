/**
 * Lightweight markdown renderer for the mini-app.
 *
 * Why a hand-rolled parser instead of `react-markdown`: pulling in
 * react-markdown + remark + rehype adds ~80kB gzipped to the mini-app
 * bundle, which is overkill for builder proposal descriptions that
 * use only the basic formatting subset (paragraphs, bold, italic,
 * inline code, links, headings, lists). This module renders to plain
 * React nodes — no `dangerouslySetInnerHTML`, no HTML injection risk.
 *
 * Supported syntax (block):
 *   - `# H1` / `## H2` / `### H3` headings
 *   - `- item` / `* item` bullet lists (consecutive lines = one list)
 *   - `1. item` numbered lists
 *   - Blank line separates paragraphs
 *
 * Supported syntax (inline):
 *   - `**bold**`
 *   - `*italic*` and `_italic_`
 *   - `` `code` `` inline code
 *   - `[label](url)` links — opens in a new tab with `noopener`
 *
 * Anything that doesn't match one of these patterns falls through as
 * plain text — safe by construction (no eval, no innerHTML).
 *
 * NOT supported (intentionally — out of scope for the lightweight view):
 *   - Tables, blockquotes, fenced code blocks, raw HTML, images,
 *     nested lists, footnotes, task lists.
 *
 * If a future requirement needs the full markdown spec (e.g. a long-
 * form proposal page), swap this for `react-markdown` and retire the
 * helper. Don't extend this file beyond what fits comfortably in
 * one screen — every added feature is a parser bug waiting to happen.
 */

import type { ReactNode } from "react"

type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string }

/**
 * Tokenize a single line of inline markdown. Walks left-to-right and
 * tries each pattern at the current cursor — first match wins. The
 * order of the regexes matters: `**` must be tried before `*`, and
 * link parsing must run before italic so `[*x*](url)` doesn't get
 * miscounted.
 */
function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let i = 0
  let buffer = ""
  const flushBuffer = () => {
    if (buffer.length > 0) {
      tokens.push({ type: "text", value: buffer })
      buffer = ""
    }
  }
  while (i < input.length) {
    // Inline code (`...`) — eat greedily up to the next backtick.
    if (input[i] === "`") {
      const close = input.indexOf("`", i + 1)
      if (close > i) {
        flushBuffer()
        tokens.push({ type: "code", value: input.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }
    // Link: [label](href). Reject if either segment is missing.
    if (input[i] === "[") {
      const labelEnd = input.indexOf("]", i + 1)
      if (labelEnd > i && input[labelEnd + 1] === "(") {
        const hrefEnd = input.indexOf(")", labelEnd + 2)
        if (hrefEnd > labelEnd) {
          flushBuffer()
          tokens.push({
            type: "link",
            label: input.slice(i + 1, labelEnd),
            href: input.slice(labelEnd + 2, hrefEnd),
          })
          i = hrefEnd + 1
          continue
        }
      }
    }
    // Bold (**...**) — must come before italic (*) to avoid eating
    // the opening `**` as italic.
    if (input.startsWith("**", i)) {
      const close = input.indexOf("**", i + 2)
      if (close > i) {
        flushBuffer()
        tokens.push({ type: "bold", value: input.slice(i + 2, close) })
        i = close + 2
        continue
      }
    }
    // Italic with `*` — single asterisk pair on the same line.
    if (input[i] === "*") {
      const close = input.indexOf("*", i + 1)
      if (close > i) {
        flushBuffer()
        tokens.push({ type: "italic", value: input.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }
    // Italic with `_` — same idea but the underscore variant.
    if (input[i] === "_") {
      const close = input.indexOf("_", i + 1)
      if (close > i) {
        flushBuffer()
        tokens.push({ type: "italic", value: input.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }
    buffer += input[i]
    i++
  }
  flushBuffer()
  return tokens
}

function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((t, idx) => {
    if (t.type === "text") return <span key={idx}>{t.value}</span>
    if (t.type === "bold") return <strong key={idx} className="font-semibold text-white">{t.value}</strong>
    if (t.type === "italic") return <em key={idx} className="italic">{t.value}</em>
    if (t.type === "code") return (
      <code key={idx} className="px-1 rounded bg-white/[0.06] font-mono text-[10px] text-amber-200">
        {t.value}
      </code>
    )
    if (t.type === "link") return (
      <a
        key={idx}
        href={t.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-300 hover:text-amber-200 underline"
      >
        {t.label}
      </a>
    )
    return null
  })
}

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }

/**
 * Group consecutive lines into block tokens. Blank lines split blocks;
 * consecutive bullet/number lines fold into a single list block.
 */
function tokenizeBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      i++
      continue
    }

    // Headings — `#` / `##` / `###` followed by a space and the text.
    const h = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1].length as 1 | 2 | 3
      blocks.push({
        type: level === 1 ? "h1" : level === 2 ? "h2" : "h3",
        text: h[2],
      })
      i++
      continue
    }

    // Bullet list — collect all consecutive bullet lines.
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""))
        i++
      }
      blocks.push({ type: "ul", items })
      continue
    }

    // Numbered list — same idea but `1.` / `2.` / etc.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""))
        i++
      }
      blocks.push({ type: "ol", items })
      continue
    }

    // Paragraph — fold consecutive non-blank, non-special lines into
    // one paragraph (newlines inside collapse to spaces, mirroring
    // the standard markdown behavior).
    const paragraphLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trim())
      i++
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphLines.join(" ") })
    }
  }
  return blocks
}

/**
 * Render markdown source to React. Drop-in replacement for an inline
 * `<div>{md}</div>` — pass the markdown string and a className for
 * the wrapper. Inline children inherit the wrapper's text color, so
 * tone the wrapper to match the surrounding context.
 */
export default function MiniMarkdown({
  source,
  className = "",
}: {
  source: string
  className?: string
}) {
  if (!source || source.trim().length === 0) return null
  const blocks = tokenizeBlocks(source)
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((b, idx) => {
        if (b.type === "h1") {
          return (
            <h3 key={idx} className="text-sm font-bold text-white">
              {renderInline(tokenizeInline(b.text))}
            </h3>
          )
        }
        if (b.type === "h2") {
          return (
            <h4 key={idx} className="text-[12px] font-semibold text-white">
              {renderInline(tokenizeInline(b.text))}
            </h4>
          )
        }
        if (b.type === "h3") {
          return (
            <h5 key={idx} className="text-[11px] font-semibold text-neutral-200">
              {renderInline(tokenizeInline(b.text))}
            </h5>
          )
        }
        if (b.type === "paragraph") {
          return (
            <p key={idx} className="leading-relaxed">
              {renderInline(tokenizeInline(b.text))}
            </p>
          )
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="list-disc pl-4 space-y-0.5">
              {b.items.map((item, i) => (
                <li key={i}>{renderInline(tokenizeInline(item))}</li>
              ))}
            </ul>
          )
        }
        if (b.type === "ol") {
          return (
            <ol key={idx} className="list-decimal pl-4 space-y-0.5">
              {b.items.map((item, i) => (
                <li key={i}>{renderInline(tokenizeInline(item))}</li>
              ))}
            </ol>
          )
        }
        return null
      })}
    </div>
  )
}
