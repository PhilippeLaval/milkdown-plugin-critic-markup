import type { Extension as FromMarkdownExtension, CompileContext, Token } from 'mdast-util-from-markdown'

// Map of parent token type → number of trailing close chars to strip from data
// Simple constructs: data ends with `XX}` where XX is the close chars + `}`
// The data token now includes the close markers.
// For insert: data ends with `++}`, strip 3 chars
// For comment: data ends with `<<}`, strip 3 chars
// For substitute: old data ends with `~` (before `>`), new data ends with `~~}`, strip 3 chars

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
      criticInsertData: exitCriticInsertData,
      criticInsert: exitCriticInsert,
      criticDeleteData: exitCriticDeleteData,
      criticDelete: exitCriticDelete,
      criticHighlightData: exitCriticHighlightData,
      criticHighlight: exitCriticHighlight,
      criticCommentData: exitCriticCommentData,
      criticComment: exitCriticComment,
      criticSubstituteOldData: exitSubstituteOldData,
      criticSubstituteNewData: exitSubstituteNewData,
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

// Data includes trailing close markers (e.g., `content++}` for insert)
// Strip the trailing 3 chars (closeChar + closeChar + `}`)
function exitCriticInsertData(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const value = raw.slice(0, -3) // strip `++}`
  addTextChild(this, value)
}

function exitCriticDeleteData(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const value = raw.slice(0, -3) // strip `--}`
  addTextChild(this, value)
}

function exitCriticHighlightData(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const value = raw.slice(0, -3) // strip `==}`
  addTextChild(this, value)
}

function exitCriticCommentData(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const value = raw.slice(0, -3) // strip `<<}`
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
    node.value += value.slice(prefixMatch[0].length)
  } else if (/^\\+\[@critic:/.test(value)) {
    // Remove one layer of backslash escaping before [@critic:
    node.value += value.slice(1)
  } else {
    node.value += value
  }
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
  this.exit(token)
}

function exitCriticDelete(this: CompileContext, token: Token) {
  this.exit(token)
}

function exitCriticHighlight(this: CompileContext, token: Token) {
  this.exit(token)
}

function exitCriticComment(this: CompileContext, token: Token) {
  this.exit(token)
}

// Substitute old data: ends with `~` (the `~` before `>` separator)
// Strip trailing 1 char
function exitSubstituteOldData(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const value = raw.slice(0, -1) // strip trailing `~`
  const node = this.stack[this.stack.length - 1] as unknown as {
    deleteChildren: Array<{ type: string; value: string }>
  }
  node.deleteChildren.push({ type: 'text', value })
}

// Substitute new data: ends with `~~}`, strip 3 chars
function exitSubstituteNewData(this: CompileContext, token: Token) {
  const raw = this.sliceSerialize(token)
  const value = raw.slice(0, -3) // strip `~~}`
  const node = this.stack[this.stack.length - 1] as unknown as {
    insertChildren: Array<{ type: string; value: string }>
  }
  node.insertChildren.push({ type: 'text', value })
}

function exitCriticSubstitute(this: CompileContext, token: Token) {
  this.exit(token)
}
