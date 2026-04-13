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

    // Dispatch the PM transaction first
    const tr = state.tr.replaceSelectionWith(node)
    dispatch(tr)

    // Only create thread state after successful dispatch
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
      anchorText: '',
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
      if (mark.type === criticInsertMark.type(ctx)) {
        // Accept insert: remove mark, keep text
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
        // Accept delete: remove text and mark
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
        // Accept highlight: remove mark, keep text
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
      if (mark.type === criticInsertMark.type(ctx)) {
        // Reject insert: remove text and mark
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
        // Reject delete: remove mark, keep text
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
        // Reject highlight: remove mark, keep text
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

function findMarkStart(
  doc: import('prosemirror-model').Node,
  pos: number,
  markType: import('prosemirror-model').MarkType,
): number {
  let start = pos
  doc.nodesBetween(0, pos, (node, nodePos) => {
    if (node.isText && mark(node, markType)) {
      start = nodePos
    }
  })
  // Walk backwards from pos
  const $pos = doc.resolve(pos)
  let p = $pos.start()
  doc.nodesBetween(p, pos, (node, nodePos) => {
    if (node.isText && mark(node, markType)) {
      start = nodePos
    }
  })
  return start
}

function findMarkEnd(
  doc: import('prosemirror-model').Node,
  pos: number,
  markType: import('prosemirror-model').MarkType,
): number {
  const $pos = doc.resolve(pos)
  const end = $pos.end()
  let markEnd = pos
  doc.nodesBetween(pos, end, (node, nodePos) => {
    if (node.isText && mark(node, markType)) {
      markEnd = nodePos + node.nodeSize
    }
  })
  return markEnd
}

function mark(
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
