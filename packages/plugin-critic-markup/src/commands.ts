import { $command, $ctx } from '@milkdown/utils'
import { toggleMark } from 'prosemirror-commands'
import type { EditorState } from 'prosemirror-state'
import { criticInsertMark, criticDeleteMark, criticHighlightMark, criticCommentNode } from './schema.js'
import type { CriticMarkupOptions, CriticChangeEvent, CriticThread, CriticThreadComment, CriticThreadsConfig, CriticChange } from './types.js'

// Options slice (auto-injected via $ctx)
export const criticMarkupOptionsCtx = $ctx<CriticMarkupOptions, 'criticMarkupOptions'>(
  {
    authorId: '',
    enableFloatingToolbar: true,
    enableSidebar: false,
  },
  'criticMarkupOptions',
)
export const criticMarkupOptionsSlice = criticMarkupOptionsCtx.key

// Threads slice
export const criticThreadsCtx = $ctx<Map<string, CriticThread>, 'criticThreads'>(
  new Map(),
  'criticThreads',
)
export const criticThreadsSlice = criticThreadsCtx.key

// Threads config slice
export const criticThreadsConfigCtx = $ctx<CriticThreadsConfig, 'criticThreadsConfig'>(
  {},
  'criticThreadsConfig',
)
export const criticThreadsConfigSlice = criticThreadsConfigCtx.key

// Changes slice for sidebar
export const criticChangesCtx = $ctx<CriticChange[], 'criticChanges'>([], 'criticChanges')
export const criticChangesSlice = criticChangesCtx.key

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

type CommandDispatch = (tr: import('prosemirror-state').Transaction) => void

// --- Mark commands ---

export const addInsertCommand = $command('AddInsert', (ctx) => () => {
  return toggleMark(criticInsertMark.type(ctx))
})

export const addDeleteCommand = $command('AddDelete', (ctx) => () => {
  return toggleMark(criticDeleteMark.type(ctx))
})

export const addHighlightCommand = $command('AddHighlight', (ctx) => () => {
  return toggleMark(criticHighlightMark.type(ctx))
})

// Substitution: wraps the selection with a criticDelete mark on the existing text,
// then expects the user to type the replacement (which gets criticInsert).
// Both marks share a substituteGroupId so the serializer can merge them.
export const addSubstituteCommand = $command('AddSubstitute', (ctx) =>
  (replacementText: string) => {
    return (state: EditorState, dispatch?: CommandDispatch) => {
      if (!dispatch) return state.selection.empty ? false : true
      if (state.selection.empty) return false
      if (!replacementText) return false

      const { from, to } = state.selection

      // Guard: substitution must stay within a single inline parent
      const $from = state.doc.resolve(from)
      const $to = state.doc.resolve(to)
      if ($from.parent !== $to.parent) return false
      const groupId = generateId()
      const deleteMark = criticDeleteMark.type(ctx).create({ substituteGroupId: groupId })
      const insertMark = criticInsertMark.type(ctx).create({ substituteGroupId: groupId })

      let tr = state.tr
      tr = tr.addMark(from, to, deleteMark)
      const insertNode = state.schema.text(replacementText, [insertMark])
      tr = tr.insert(to, insertNode)
      dispatch(tr)
      return true
    }
  },
)

// --- Comment command ---

export const addCommentCommand = $command('AddComment', (ctx) => (commentText: string) => {
  return (state: EditorState, dispatch?: CommandDispatch) => {
    // Side-effect free when dispatch is absent (command probing)
    if (!dispatch) return true

    const options = ctx.get(criticMarkupOptionsSlice)
    const threadId = generateId()
    const node = criticCommentNode.type(ctx).create({
      comment: commentText,
      authorId: options.authorId,
      threadId,
    })

    // Dispatch the PM transaction — threadId is now serialized into the
    // Markdown via the [@threadId] prefix, so it survives round-trips natively
    const tr = state.tr.replaceSelectionWith(node)
    dispatch(tr)

    // Create thread state after successful dispatch
    const threads = new Map(ctx.get(criticThreadsSlice))
    const rootComment: CriticThreadComment = {
      commentId: generateId(),
      threadId,
      authorId: options.authorId,
      authorDisplayName: '',
      body: commentText,
      createdAt: Date.now(),
    }
    threads.set(threadId, {
      threadId,
      anchorText: commentText,
      resolved: false,
      comments: [rootComment],
    })
    ctx.set(criticThreadsSlice, threads)
    ctx.get(criticThreadsConfigSlice).onThreadsChange?.(threads)

    return true
  }
})

// --- Accept/Reject commands ---

export const acceptChangeCommand = $command('AcceptChange', (ctx) => (pos?: number) => {
  return (state: EditorState, dispatch?: CommandDispatch) => {
    const { doc, selection, tr: transaction } = state
    const from = pos ?? selection.from
    const $pos = doc.resolve(from)
    const node = $pos.parent.maybeChild($pos.index())

    if (!node) return false

    const options = ctx.get(criticMarkupOptionsSlice)

    // Check for critic comment node
    if (node.type === criticCommentNode.type(ctx)) {
      const nodePos = $pos.before($pos.depth + 1)
      if (dispatch) {
        const tr = state.tr.delete(nodePos, nodePos + node.nodeSize)
        dispatch(tr)
        removeThreadForComment(ctx, node.attrs.threadId)
        fireOnChange(options, 'accept', 'comment', nodePos, nodePos + node.nodeSize, '')
      }
      return true
    }

    // Check marks on the resolved position
    const nodeAt = doc.nodeAt(from)
    if (!nodeAt) return false

    for (const mark of nodeAt.marks) {
      const groupId = mark.attrs.substituteGroupId

      if (mark.type === criticInsertMark.type(ctx)) {
        if (groupId) {
          // Part of a substitution pair — accept means keep insert, delete the paired delete
          if (dispatch) {
            acceptSubstitution(ctx, state, from, groupId, dispatch)
            fireOnChange(options, 'accept', 'substitute', from, from, '')
          }
          return true
        }
        // Standalone insert: remove mark, keep text
        if (dispatch) {
          const markFrom = findMarkStart(doc, from, mark.type)
          const markTo = findMarkEnd(doc, from, mark.type)
          const tr = state.tr.removeMark(markFrom, markTo, mark.type)
          dispatch(tr)
          fireOnChange(options, 'accept', 'insert', markFrom, markTo, doc.textBetween(markFrom, markTo))
        }
        return true
      }

      if (mark.type === criticDeleteMark.type(ctx)) {
        if (groupId) {
          // Part of a substitution pair — accept means keep insert, delete the paired delete
          if (dispatch) {
            acceptSubstitution(ctx, state, from, groupId, dispatch)
            fireOnChange(options, 'accept', 'substitute', from, from, '')
          }
          return true
        }
        // Standalone delete: remove text and mark
        if (dispatch) {
          const markFrom = findMarkStart(doc, from, mark.type)
          const markTo = findMarkEnd(doc, from, mark.type)
          const tr = state.tr.delete(markFrom, markTo)
          dispatch(tr)
          fireOnChange(options, 'accept', 'delete', markFrom, markTo, doc.textBetween(markFrom, markTo))
        }
        return true
      }

      if (mark.type === criticHighlightMark.type(ctx)) {
        if (dispatch) {
          const markFrom = findMarkStart(doc, from, mark.type)
          const markTo = findMarkEnd(doc, from, mark.type)
          const tr = state.tr.removeMark(markFrom, markTo, mark.type)
          dispatch(tr)
          fireOnChange(options, 'accept', 'highlight', markFrom, markTo, doc.textBetween(markFrom, markTo))
        }
        return true
      }
    }

    return false
  }
})

export const rejectChangeCommand = $command('RejectChange', (ctx) => (pos?: number) => {
  return (state: EditorState, dispatch?: CommandDispatch) => {
    const { doc, selection } = state
    const from = pos ?? selection.from
    const $pos = doc.resolve(from)
    const node = $pos.parent.maybeChild($pos.index())

    if (!node) return false

    const options = ctx.get(criticMarkupOptionsSlice)

    // Check for critic comment node
    if (node.type === criticCommentNode.type(ctx)) {
      const nodePos = $pos.before($pos.depth + 1)
      if (dispatch) {
        const tr = state.tr.delete(nodePos, nodePos + node.nodeSize)
        dispatch(tr)
        removeThreadForComment(ctx, node.attrs.threadId)
        fireOnChange(options, 'reject', 'comment', nodePos, nodePos + node.nodeSize, '')
      }
      return true
    }

    const nodeAt = doc.nodeAt(from)
    if (!nodeAt) return false

    for (const mark of nodeAt.marks) {
      const groupId = mark.attrs.substituteGroupId

      if (mark.type === criticInsertMark.type(ctx)) {
        if (groupId) {
          // Part of a substitution pair — reject means keep delete text, remove insert text
          if (dispatch) {
            rejectSubstitution(ctx, state, from, groupId, dispatch)
            fireOnChange(options, 'reject', 'substitute', from, from, '')
          }
          return true
        }
        // Standalone insert: remove text and mark
        if (dispatch) {
          const markFrom = findMarkStart(doc, from, mark.type)
          const markTo = findMarkEnd(doc, from, mark.type)
          const tr = state.tr.delete(markFrom, markTo)
          dispatch(tr)
          fireOnChange(options, 'reject', 'insert', markFrom, markTo, doc.textBetween(markFrom, markTo))
        }
        return true
      }

      if (mark.type === criticDeleteMark.type(ctx)) {
        if (groupId) {
          if (dispatch) {
            rejectSubstitution(ctx, state, from, groupId, dispatch)
            fireOnChange(options, 'reject', 'substitute', from, from, '')
          }
          return true
        }
        // Standalone delete: remove mark, keep text
        if (dispatch) {
          const markFrom = findMarkStart(doc, from, mark.type)
          const markTo = findMarkEnd(doc, from, mark.type)
          const tr = state.tr.removeMark(markFrom, markTo, mark.type)
          dispatch(tr)
          fireOnChange(options, 'reject', 'delete', markFrom, markTo, doc.textBetween(markFrom, markTo))
        }
        return true
      }

      if (mark.type === criticHighlightMark.type(ctx)) {
        if (dispatch) {
          const markFrom = findMarkStart(doc, from, mark.type)
          const markTo = findMarkEnd(doc, from, mark.type)
          const tr = state.tr.removeMark(markFrom, markTo, mark.type)
          dispatch(tr)
          fireOnChange(options, 'reject', 'highlight', markFrom, markTo, doc.textBetween(markFrom, markTo))
        }
        return true
      }
    }

    return false
  }
})

export const acceptAllChangesCommand = $command('AcceptAllChanges', (ctx) => () => {
  return (state: EditorState, dispatch?: CommandDispatch) => {
    if (!dispatch) return true
    let tr = state.tr
    const { doc } = state
    let offset = 0

    doc.descendants((node, pos) => {
      // Handle comment nodes
      if (node.type === criticCommentNode.type(ctx)) {
        tr = tr.delete(pos + offset, pos + offset + node.nodeSize)
        offset -= node.nodeSize
        return false
      }

      for (const mark of node.marks) {
        if (mark.type === criticInsertMark.type(ctx)) {
          tr = tr.removeMark(pos + offset, pos + offset + node.nodeSize, mark.type)
        } else if (mark.type === criticDeleteMark.type(ctx)) {
          tr = tr.delete(pos + offset, pos + offset + node.nodeSize)
          offset -= node.nodeSize
          return false
        } else if (mark.type === criticHighlightMark.type(ctx)) {
          tr = tr.removeMark(pos + offset, pos + offset + node.nodeSize, mark.type)
        }
      }
      return true
    })

    dispatch(tr)
    removeAllThreads(ctx)
    return true
  }
})

export const rejectAllChangesCommand = $command('RejectAllChanges', (ctx) => () => {
  return (state: EditorState, dispatch?: CommandDispatch) => {
    if (!dispatch) return true
    let tr = state.tr
    const { doc } = state
    let offset = 0

    doc.descendants((node, pos) => {
      // Handle comment nodes
      if (node.type === criticCommentNode.type(ctx)) {
        tr = tr.delete(pos + offset, pos + offset + node.nodeSize)
        offset -= node.nodeSize
        return false
      }

      for (const mark of node.marks) {
        if (mark.type === criticInsertMark.type(ctx)) {
          tr = tr.delete(pos + offset, pos + offset + node.nodeSize)
          offset -= node.nodeSize
          return false
        } else if (mark.type === criticDeleteMark.type(ctx)) {
          tr = tr.removeMark(pos + offset, pos + offset + node.nodeSize, mark.type)
        } else if (mark.type === criticHighlightMark.type(ctx)) {
          tr = tr.removeMark(pos + offset, pos + offset + node.nodeSize, mark.type)
        }
      }
      return true
    })

    dispatch(tr)
    removeAllThreads(ctx)
    return true
  }
})

// --- Threading commands ---

export const addReplyCommand = $command('AddReply', (ctx) =>
  (payload: { threadId: string; body: string; parentCommentId?: string }) => {
    return (_state: EditorState, _dispatch?: CommandDispatch) => {
      const threads = ctx.get(criticThreadsSlice)
      const thread = threads.get(payload.threadId)
      if (!thread) return false

      const options = ctx.get(criticMarkupOptionsSlice)
      const reply: CriticThreadComment = {
        commentId: generateId(),
        threadId: payload.threadId,
        parentCommentId: payload.parentCommentId,
        authorId: options.authorId,
        authorDisplayName: '',
        body: payload.body,
        createdAt: Date.now(),
      }

      const updated = new Map(threads)
      updated.set(payload.threadId, {
        ...thread,
        comments: [...thread.comments, reply],
      })
      ctx.set(criticThreadsSlice, updated)
      ctx.get(criticThreadsConfigSlice).onThreadsChange?.(updated)
      return true
    }
  },
)

export const resolveThreadCommand = $command('ResolveThread', (ctx) =>
  (payload: { threadId: string; resolved: boolean }) => {
    return (state: EditorState, dispatch?: CommandDispatch) => {
      const threads = ctx.get(criticThreadsSlice)
      const thread = threads.get(payload.threadId)
      if (!thread) return false

      const options = ctx.get(criticMarkupOptionsSlice)
      const updated = new Map(threads)
      updated.set(payload.threadId, {
        ...thread,
        resolved: payload.resolved,
        resolvedBy: payload.resolved ? options.authorId : undefined,
        resolvedAt: payload.resolved ? Date.now() : undefined,
      })
      ctx.set(criticThreadsSlice, updated)
      ctx.get(criticThreadsConfigSlice).onThreadsChange?.(updated)

      // Update the PM node's resolved attr
      if (dispatch) {
        let tr = state.tr
        state.doc.descendants((node, pos) => {
          if (
            node.type === criticCommentNode.type(ctx) &&
            node.attrs.threadId === payload.threadId
          ) {
            tr = tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              resolved: payload.resolved,
            })
          }
        })
        dispatch(tr)
      }
      return true
    }
  },
)

export const editCommentCommand = $command('EditComment', (ctx) =>
  (payload: { threadId: string; commentId: string; body: string }) => {
    return () => {
      const threads = ctx.get(criticThreadsSlice)
      const thread = threads.get(payload.threadId)
      if (!thread) return false

      const options = ctx.get(criticMarkupOptionsSlice)
      const commentIndex = thread.comments.findIndex(
        (c) => c.commentId === payload.commentId && c.authorId === options.authorId,
      )
      if (commentIndex === -1) return false

      const updatedComments = [...thread.comments]
      updatedComments[commentIndex] = {
        ...updatedComments[commentIndex],
        body: payload.body,
        editedAt: Date.now(),
      }

      const updated = new Map(threads)
      updated.set(payload.threadId, { ...thread, comments: updatedComments })
      ctx.set(criticThreadsSlice, updated)
      ctx.get(criticThreadsConfigSlice).onThreadsChange?.(updated)
      return true
    }
  },
)

export const deleteCommentCommand = $command('DeleteComment', (ctx) =>
  (payload: { threadId: string; commentId: string }) => {
    return (state: EditorState, dispatch?: CommandDispatch) => {
      const threads = ctx.get(criticThreadsSlice)
      const thread = threads.get(payload.threadId)
      if (!thread) return false

      const options = ctx.get(criticMarkupOptionsSlice)
      const comment = thread.comments.find(
        (c) => c.commentId === payload.commentId && c.authorId === options.authorId,
      )
      if (!comment) return false

      // If it's the root comment, remove the PM node
      if (!comment.parentCommentId) {
        if (dispatch) {
          let tr = state.tr
          let nodePos = -1
          state.doc.descendants((node, pos) => {
            if (
              node.type === criticCommentNode.type(ctx) &&
              node.attrs.threadId === payload.threadId
            ) {
              nodePos = pos
            }
          })
          if (nodePos >= 0) {
            const node = state.doc.nodeAt(nodePos)
            if (node) {
              tr = tr.delete(nodePos, nodePos + node.nodeSize)
              dispatch(tr)
            }
          }
        }

        const updated = new Map(threads)
        updated.delete(payload.threadId)
        ctx.set(criticThreadsSlice, updated)
        ctx.get(criticThreadsConfigSlice).onThreadsChange?.(updated)
        return true
      }

      // Otherwise just remove the reply
      const updatedComments = thread.comments.filter(
        (c) => c.commentId !== payload.commentId,
      )
      const updated = new Map(threads)
      updated.set(payload.threadId, { ...thread, comments: updatedComments })
      ctx.set(criticThreadsSlice, updated)
      ctx.get(criticThreadsConfigSlice).onThreadsChange?.(updated)
      return true
    }
  },
)

// --- Substitution accept/reject helpers ---

/**
 * Find the contiguous substitution pair (delete + insert) touching `pos`.
 * Only returns the immediately adjacent delete and insert nodes around
 * the target position — does NOT scan the whole parent for the groupId,
 * so duplicated substitutions with the same groupId are not affected.
 */
function findSubstitutionPair(
  ctx: import('@milkdown/ctx').Ctx,
  doc: import('prosemirror-model').Node,
  pos: number,
  groupId: string,
): Array<{ from: number; to: number; markType: import('prosemirror-model').MarkType; type: 'delete' | 'insert' }> {
  const $pos = doc.resolve(pos)
  const parent = $pos.parent
  const parentStart = $pos.start()
  const targetIdx = $pos.index()
  const ranges: Array<{ from: number; to: number; markType: import('prosemirror-model').MarkType; type: 'delete' | 'insert' }> = []

  const tryChild = (i: number): boolean => {
    if (i < 0 || i >= parent.childCount) return false
    const child = parent.child(i)
    for (const mark of child.marks) {
      if (mark.attrs.substituteGroupId !== groupId) continue
      const childPos = parentStart + parent.content.offsetAt(i)
      if (mark.type === criticDeleteMark.type(ctx)) {
        ranges.push({ from: childPos, to: childPos + child.nodeSize, markType: mark.type, type: 'delete' })
        return true
      } else if (mark.type === criticInsertMark.type(ctx)) {
        ranges.push({ from: childPos, to: childPos + child.nodeSize, markType: mark.type, type: 'insert' })
        return true
      }
    }
    return false
  }

  // Walk the full contiguous run of siblings with matching groupId.
  // A substitution can span multiple inline children (e.g. formatted text).
  // Start from target, walk left until no match, then walk right.
  for (let i = targetIdx; i >= 0; i--) {
    if (!tryChild(i)) break
  }
  for (let i = targetIdx + 1; i < parent.childCount; i++) {
    if (!tryChild(i)) break
  }

  return ranges
}

/**
 * Accept a substitution: keep the insert text (remove its mark),
 * delete the delete text. Scoped to the contiguous pair around pos.
 */
function acceptSubstitution(
  ctx: import('@milkdown/ctx').Ctx,
  state: EditorState,
  pos: number,
  groupId: string,
  dispatch: CommandDispatch,
) {
  const ranges = findSubstitutionPair(ctx, state.doc, pos, groupId)
  let tr = state.tr

  // Process in reverse position order to maintain valid positions
  ranges.sort((a, b) => b.from - a.from)
  for (const range of ranges) {
    if (range.type === 'delete') {
      tr = tr.delete(range.from, range.to)
    } else {
      tr = tr.removeMark(range.from, range.to, range.markType)
    }
  }

  dispatch(tr)
}

/**
 * Reject a substitution: keep the delete text (remove its mark),
 * delete the insert text. Scoped to the contiguous pair around pos.
 */
function rejectSubstitution(
  ctx: import('@milkdown/ctx').Ctx,
  state: EditorState,
  pos: number,
  groupId: string,
  dispatch: CommandDispatch,
) {
  const ranges = findSubstitutionPair(ctx, state.doc, pos, groupId)
  let tr = state.tr

  ranges.sort((a, b) => b.from - a.from)
  for (const range of ranges) {
    if (range.type === 'insert') {
      tr = tr.delete(range.from, range.to)
    } else {
      tr = tr.removeMark(range.from, range.to, range.markType)
    }
  }

  dispatch(tr)
}

// --- Thread cleanup helpers ---

function removeThreadForComment(ctx: import('@milkdown/ctx').Ctx, threadId: string) {
  if (!threadId) return
  const threads = ctx.get(criticThreadsSlice)
  if (!threads.has(threadId)) return
  const updated = new Map(threads)
  updated.delete(threadId)
  ctx.set(criticThreadsSlice, updated)
  ctx.get(criticThreadsConfigSlice).onThreadsChange?.(updated)
}

function removeAllThreads(ctx: import('@milkdown/ctx').Ctx) {
  const threads = ctx.get(criticThreadsSlice)
  if (threads.size === 0) return
  const empty = new Map<string, CriticThread>()
  ctx.set(criticThreadsSlice, empty)
  ctx.get(criticThreadsConfigSlice).onThreadsChange?.(empty)
}

// --- Helpers ---

/**
 * Find the start of the contiguous mark span containing `pos`.
 * Walks backward from pos within the same parent block and stops
 * at the first node that does NOT carry the mark.
 */
function findMarkStart(
  doc: import('prosemirror-model').Node,
  pos: number,
  markType: import('prosemirror-model').MarkType,
): number {
  const $pos = doc.resolve(pos)
  const parent = $pos.parent
  const parentOffset = $pos.start()

  let start = pos
  for (let i = $pos.index(); i >= 0; i--) {
    const child = parent.child(i)
    if (!hasMark(child, markType)) break
    start = parentOffset + parent.content.offsetAt(i)
  }
  return start
}

/**
 * Find the end of the contiguous mark span containing `pos`.
 * Walks forward from pos within the same parent block and stops
 * at the first node that does NOT carry the mark.
 * Traverses past inline non-text nodes (hard breaks, atoms) if they carry the mark.
 */
function findMarkEnd(
  doc: import('prosemirror-model').Node,
  pos: number,
  markType: import('prosemirror-model').MarkType,
): number {
  const $pos = doc.resolve(pos)
  const parent = $pos.parent
  const parentOffset = $pos.start()

  let end = pos
  for (let i = $pos.index(); i < parent.childCount; i++) {
    const child = parent.child(i)
    if (!hasMark(child, markType)) break
    end = parentOffset + parent.content.offsetAt(i) + child.nodeSize
  }
  return end
}

function hasMark(
  node: import('prosemirror-model').Node,
  markType: import('prosemirror-model').MarkType,
): boolean {
  return node.marks.some((m) => m.type === markType)
}

function fireOnChange(
  options: CriticMarkupOptions,
  type: 'accept' | 'reject',
  markType: CriticChangeEvent['markType'],
  from: number,
  to: number,
  text: string,
) {
  options.onChange?.({ type, markType, from, to, text })
}
