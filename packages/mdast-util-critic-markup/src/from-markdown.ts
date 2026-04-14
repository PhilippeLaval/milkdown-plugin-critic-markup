import type { Extension as FromMarkdownExtension, CompileContext, Token } from 'mdast-util-from-markdown'
import { fromMarkdown } from 'mdast-util-from-markdown'
import type { PhrasingContent } from 'mdast'

// Parent tokens always wrap the full `{xx...xx}` run. We derive the inner
// content by slicing the parent token and trimming the 3-char markers on each
// side — this is robust across line endings (where data tokens are split).
//
// Inner content of critic spans is re-parsed with fromMarkdown so embedded
// markdown (`**bold**`, `[link](url)`, etc.) becomes real mdast children
// instead of literal text. For multi-line spans we parse each line in
// isolation: a CriticMarkup mark is phrasing-only, so block constructs
// (headings, tables) can't round-trip anyway and stay as literal text — but
// per-line inline markdown still renders correctly.

// Walk parsed inline children and invalidate position offsets. Milkdown's
// `remarkMarker` plugin reads `file.value.charAt(node.position.start.offset)`
// to infer `*`/`_` for strong/emphasis. Our re-parsed nodes carry positions
// relative to the inner critic content, but `file.value` is the outer
// document — so a 0-offset strong inside `{++**bold**++}` would read `{` and
// serialize back as `{{bold{{`. Setting offset to -1 makes `charAt` return an
// empty string, and the strong/emphasis handlers fall back to their `*`/`_`
// defaults.
function invalidatePositions(nodes: unknown[]): void {
  for (const n of nodes) {
    const node = n as { position?: { start?: { offset?: number }; end?: { offset?: number } }; children?: unknown[] }
    if (node.position?.start) node.position.start.offset = -1
    if (node.position?.end) node.position.end.offset = -1
    if (Array.isArray(node.children)) invalidatePositions(node.children)
  }
}

function parseAsParagraph(src: string): PhrasingContent[] | null {
  try {
    const tree = fromMarkdown(src)
    if (tree.children.length === 1 && tree.children[0].type === 'paragraph') {
      return tree.children[0].children as PhrasingContent[]
    }
  } catch {
    // swallow — caller falls back to literal text
  }
  return null
}

// A zero-width sentinel we prepend to force inline (paragraph) parsing when
// the raw line would otherwise be interpreted as a block construct (list
// marker, heading, table, blockquote, indented code, etc.). We strip it back
// off the first text child before returning. We don't use a visible char
// because it must round-trip through mdast-util-from-markdown unchanged.
const GUARD = '\u200B'

function parseLineInline(line: string): PhrasingContent[] {
  if (!line) return []
  // fromMarkdown trims leading/trailing whitespace inside paragraphs, so we
  // peel it off and re-attach as text nodes to preserve `{++ spaced ++}`.
  const lead = line.match(/^\s*/)![0]
  const trail = line.slice(lead.length).match(/\s*$/)![0]
  const mid = line.slice(lead.length, line.length - trail.length)
  const out: PhrasingContent[] = []
  if (lead) out.push({ type: 'text', value: lead })
  if (mid) {
    let children = parseAsParagraph(mid)
    if (!children) {
      const guarded = parseAsParagraph(GUARD + mid)
      if (guarded && guarded.length > 0) {
        const first = guarded[0] as { type: string; value?: string }
        if (first.type === 'text' && first.value && first.value.startsWith(GUARD)) {
          const stripped = first.value.slice(GUARD.length)
          children = stripped
            ? [{ ...(first as PhrasingContent), value: stripped } as PhrasingContent, ...guarded.slice(1)]
            : guarded.slice(1)
        }
      }
    }
    if (children) {
      invalidatePositions(children)
      out.push(...children)
    } else {
      out.push({ type: 'text', value: mid })
    }
  }
  if (trail) out.push({ type: 'text', value: trail })
  return out
}

function parseInlineChildren(raw: string): PhrasingContent[] | null {
  if (raw.length === 0) return null
  const lines = raw.split('\n')
  const out: PhrasingContent[] = []
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) out.push({ type: 'text', value: '\n' })
    out.push(...parseLineInline(lines[i]))
  }
  return out.length > 0 ? out : null
}

function setChildren(ctx: CompileContext, children: PhrasingContent[]) {
  const parent = ctx.stack[ctx.stack.length - 1] as unknown as { children: PhrasingContent[] }
  parent.children = children
}

function fillChildren(ctx: CompileContext, raw: string) {
  const parsed = parseInlineChildren(raw)
  if (parsed) setChildren(ctx, parsed)
  else addTextChild(ctx, raw)
}

export function criticMarkupFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      criticInsert: enterCriticInsert,
      criticDelete: enterCriticDelete,
      criticHighlight: enterCriticHighlight,
      criticComment: enterCriticComment,
      criticSubstitute: enterCriticSubstitute,
    },
    exit: {
      criticInsert: exitCriticInsert,
      criticDelete: exitCriticDelete,
      criticHighlight: exitCriticHighlight,
      criticComment: exitCriticComment,
      criticSubstitute: exitCriticSubstitute,
    },
  }
}

function enterCriticInsert(this: CompileContext, token: Token) {
  this.enter({ type: 'criticInsert' as never, children: [] }, token)
}

function enterCriticDelete(this: CompileContext, token: Token) {
  this.enter({ type: 'criticDelete' as never, children: [] }, token)
}

function enterCriticHighlight(this: CompileContext, token: Token) {
  this.enter({ type: 'criticHighlight' as never, children: [] }, token)
}

function enterCriticComment(this: CompileContext, token: Token) {
  this.enter({ type: 'criticComment' as never, value: '' } as never, token)
}

function enterCriticSubstitute(this: CompileContext, token: Token) {
  this.enter(
    {
      type: 'criticSubstitute' as never,
      children: [],
      deleteChildren: [],
      insertChildren: [],
    } as never,
    token,
  )
}

function innerContent(raw: string): string {
  // Strip `{xx` prefix and `xx}` suffix (3 chars each).
  return raw.slice(3, -3)
}

function addTextChild(ctx: CompileContext, value: string) {
  const parent = ctx.stack[ctx.stack.length - 1]
  if ('children' in parent) {
    ;(parent.children as Array<{ type: string; value: string }>).push({
      type: 'text',
      value,
    })
  }
}

function exitCriticInsert(this: CompileContext, token: Token) {
  fillChildren(this, innerContent(this.sliceSerialize(token)))
  this.exit(token)
}

function exitCriticDelete(this: CompileContext, token: Token) {
  fillChildren(this, innerContent(this.sliceSerialize(token)))
  this.exit(token)
}

function exitCriticHighlight(this: CompileContext, token: Token) {
  fillChildren(this, innerContent(this.sliceSerialize(token)))
  this.exit(token)
}

function exitCriticComment(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const value = innerContent(raw)
  const node = this.stack[this.stack.length - 1] as unknown as { value: string; threadId?: string }

  // Parse [@critic:threadId] prefix if present.
  // Uses the `critic:` namespace to avoid collisions with user text.
  //
  // Escaping scheme (symmetric):
  //   `[@critic:id] text`    → threadId="id", value="text"  (metadata)
  //   `\[@critic:...] text`  → value="[@critic:...] text"   (escaped literal)
  //   `\\[@critic:...] text` → value="\[@critic:...] text"  (escaped backslash)
  const prefixMatch = value.match(/^\[@critic:([^\]]+)\]\s*/)
  if (prefixMatch) {
    node.threadId = prefixMatch[1]
    node.value = value.slice(prefixMatch[0].length)
  } else if (/^\\+\[@critic:/.test(value)) {
    node.value = value.slice(1)
  } else {
    node.value = value
  }
  this.exit(token)
}

function exitCriticSubstitute(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const inner = innerContent(raw) // strip `{~~` and `~~}`
  const sepIdx = inner.indexOf('~>')
  const oldText = sepIdx >= 0 ? inner.slice(0, sepIdx) : inner
  const newText = sepIdx >= 0 ? inner.slice(sepIdx + 2) : ''

  const node = this.stack[this.stack.length - 1] as unknown as {
    deleteChildren: PhrasingContent[]
    insertChildren: PhrasingContent[]
  }
  node.deleteChildren = parseInlineChildren(oldText) ?? [{ type: 'text', value: oldText }]
  node.insertChildren = parseInlineChildren(newText) ?? [{ type: 'text', value: newText }]
  this.exit(token)
}
