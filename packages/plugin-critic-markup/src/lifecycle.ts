import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { Ctx } from '@milkdown/ctx'
import {
  criticThreadsSlice,
  criticThreadsConfigSlice,
  criticChangesSlice,
} from './commands.js'
import { criticCommentNode, criticInsertMark, criticDeleteMark, criticHighlightMark } from './schema.js'
import type { CriticChange, CriticThread } from './types.js'

const criticLifecycleKey = new PluginKey('criticLifecycle')

/**
 * Lifecycle plugin that:
 * 1. Hydrates threads from initialThreads on startup
 * 2. Reattaches hydrated threads to parsed comment nodes by matching root comment body
 * 3. Populates criticChangesSlice from document state on every transaction
 */
export const criticLifecyclePlugin = $prose((ctx) => {
  // Hydrate threads from config on startup
  const config = ctx.get(criticThreadsConfigSlice)
  if (config.initialThreads && config.initialThreads.size > 0) {
    ctx.set(criticThreadsSlice, new Map(config.initialThreads))
  }

  let hasReattached = false

  return new Plugin({
    key: criticLifecycleKey,
    state: {
      init(_, state) {
        return buildChanges(ctx, state.doc)
      },
      apply(tr, oldChanges, _oldState, newState) {
        if (!tr.docChanged) return oldChanges
        return buildChanges(ctx, newState.doc)
      },
    },
    view() {
      return {
        update(view) {
          // Reattach hydrated threads to comment nodes once on first render
          if (!hasReattached) {
            hasReattached = true
            reattachThreads(ctx, view)
          }

          const changes = criticLifecycleKey.getState(view.state) as CriticChange[]
          if (changes) {
            ctx.set(criticChangesSlice, changes)
          }
        },
      }
    },
  })
})

/**
 * After the editor loads from Markdown, comment nodes have empty threadId.
 * This function matches them against hydrated threads using the root comment
 * body as the anchor key, and sets the threadId attribute on each node.
 */
function reattachThreads(ctx: Ctx, view: import('prosemirror-view').EditorView) {
  const threads = ctx.get(criticThreadsSlice)
  if (threads.size === 0) return

  // Build a lookup: root comment body -> thread
  // If multiple threads share the same body, use document order
  const bodyToThreads = new Map<string, CriticThread[]>()
  for (const thread of threads.values()) {
    const rootBody = thread.comments[0]?.body ?? ''
    const list = bodyToThreads.get(rootBody) ?? []
    list.push(thread)
    bodyToThreads.set(rootBody, list)
  }

  // Track which body keys we've consumed (for duplicate comment texts)
  const bodyIndexes = new Map<string, number>()

  let tr = view.state.tr
  let changed = false

  view.state.doc.descendants((node, pos) => {
    if (node.type !== criticCommentNode.type(ctx)) return true
    if (node.attrs.threadId) return false // already has a threadId

    const commentBody = node.attrs.comment ?? ''
    const candidates = bodyToThreads.get(commentBody)
    if (!candidates || candidates.length === 0) return false

    const idx = bodyIndexes.get(commentBody) ?? 0
    if (idx >= candidates.length) return false

    const thread = candidates[idx]
    bodyIndexes.set(commentBody, idx + 1)

    tr = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      threadId: thread.threadId,
      resolved: thread.resolved,
    })
    changed = true
    return false
  })

  if (changed) {
    view.dispatch(tr)
  }
}

function buildChanges(ctx: Ctx, doc: import('prosemirror-model').Node): CriticChange[] {
  const changes: CriticChange[] = []

  doc.descendants((node, pos) => {
    // Comment nodes
    if (node.type === criticCommentNode.type(ctx)) {
      changes.push({
        id: node.attrs.threadId || `comment-${pos}`,
        type: 'comment',
        text: '',
        comment: node.attrs.comment,
        authorId: node.attrs.authorId,
        resolved: node.attrs.resolved,
        from: pos,
        to: pos + node.nodeSize,
      })
      return false
    }

    // Mark-based changes
    for (const mark of node.marks) {
      if (mark.type === criticInsertMark.type(ctx)) {
        changes.push({
          id: `insert-${pos}`,
          type: 'insert',
          text: node.textContent,
          authorId: mark.attrs.authorId,
          resolved: false,
          from: pos,
          to: pos + node.nodeSize,
        })
      } else if (mark.type === criticDeleteMark.type(ctx)) {
        changes.push({
          id: `delete-${pos}`,
          type: 'delete',
          text: node.textContent,
          authorId: mark.attrs.authorId,
          resolved: false,
          from: pos,
          to: pos + node.nodeSize,
        })
      } else if (mark.type === criticHighlightMark.type(ctx)) {
        changes.push({
          id: `highlight-${pos}`,
          type: 'highlight',
          text: node.textContent,
          authorId: mark.attrs.authorId,
          resolved: false,
          from: pos,
          to: pos + node.nodeSize,
        })
      }
    }
    return true
  })

  return changes
}
