import type { Extension as FromMarkdownExtension, CompileContext, Token } from 'mdast-util-from-markdown'
import { fromMarkdown } from 'mdast-util-from-markdown'
import type { PhrasingContent } from 'mdast'

// Parent tokens always wrap the full `{xx...xx}` run. We derive the inner
// content by slicing the parent token and trimming the 3-char markers on each
// side — this is robust across line endings (where data tokens are split).
//
// Inner content of inline critic spans (no line endings) is re-parsed with
// fromMarkdown so embedded markdown like `**bold**` or `[link](url)` becomes
// real mdast children instead of literal text. Multi-line spans stay as raw
// text — they typically wrap block content (headings, tables) which can't be
// represented as PhrasingContent on a critic mark anyway.

function parseInlineChildren(raw: string): PhrasingContent[] | null {
  if (raw.length === 0 || raw.includes('\n')) return null
  // fromMarkdown trims leading/trailing whitespace inside paragraphs, so we
  // peel it off and re-attach as text nodes to preserve `{++ spaced ++}`.
  const lead = raw.match(/^\s*/)![0]
  const trail = raw.slice(lead.length).match(/\s*$/)![0]
  const mid = raw.slice(lead.length, raw.length - trail.length)
  if (!mid) return null
  let tree: ReturnType<typeof fromMarkdown>
  try {
    tree = fromMarkdown(mid)
  } catch {
    return null
  }
  if (tree.children.length !== 1 || tree.children[0].type !== 'paragraph') return null
  const inner = tree.children[0].children as PhrasingContent[]
  const out: PhrasingContent[] = []
  if (lead) out.push({ type: 'text', value: lead })
  out.push(...inner)
  if (trail) out.push({ type: 'text', value: trail })
  return out
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
