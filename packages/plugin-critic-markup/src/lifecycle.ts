import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { Ctx } from '@milkdown/ctx'
import {
  criticMarkupOptionsSlice,
  criticThreadsSlice,
  criticThreadsConfigSlice,
  criticChangesSlice,
} from './commands.js'
import { criticCommentNode, criticInsertMark, criticDeleteMark, criticHighlightMark } from './schema.js'
import type { CriticChange, CriticThread, CriticThreadComment } from './types.js'

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

const criticLifecycleKey = new PluginKey('criticLifecycle')

/**
 * Lifecycle plugin that:
 * 1. Hydrates threads from initialThreads on startup
 * 2. Migrates legacy comments (without [@critic:threadId]) by matching
 *    hydrated threads to comment nodes by body text
 * 3. Populates criticChangesSlice from document state on every transaction
 *
 * Thread identity is now persisted in the Markdown via the `[@critic:threadId]`
 * prefix. Legacy documents without the prefix get a one-time migration pass.
 */
export const criticLifecyclePlugin = $prose((ctx) => {
  const config = ctx.get(criticThreadsConfigSlice)
  if (config.initialThreads && config.initialThreads.size > 0) {
    ctx.set(criticThreadsSlice, new Map(config.initialThreads))
  }

  let hasMigrated = false

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
        update(view, prevState) {
          if (!hasMigrated) {
            hasMigrated = true
            migrateLegacyComments(ctx, view)
          }

          if (!prevState || !prevState.doc.eq(view.state.doc)) {
            syncThreadsFromDoc(ctx, view)
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
 * One-time migration for legacy comments that don't have a threadId
 * from the Markdown (pre-[@critic:] format). Matches hydrated threads
 * to comment nodes by body text. Only runs on first editor render.
 */
function migrateLegacyComments(ctx: Ctx, view: import('prosemirror-view').EditorView) {
  const threads = ctx.get(criticThreadsSlice)
  if (threads.size === 0) return

  // Build body → thread lookup for threads not yet matched to any comment
  const bodyLookup = new Map<string, CriticThread[]>()
  for (const thread of threads.values()) {
    const rootBody = thread.comments[0]?.body ?? ''
    const list = bodyLookup.get(rootBody) ?? []
    list.push(thread)
    bodyLookup.set(rootBody, list)
  }

  // Find comment nodes that already have a threadId (from Markdown)
  const existingThreadIds = new Set<string>()
  view.state.doc.descendants((node) => {
    if (node.type === criticCommentNode.type(ctx) && node.attrs.threadId) {
      existingThreadIds.add(node.attrs.threadId)
    }
    return true
  })

  // Only migrate comments without a threadId, matching to unused threads
  let tr = view.state.tr
  let changed = false
  const usedThreadIds = new Set(existingThreadIds)

  view.state.doc.descendants((node, pos) => {
    if (node.type !== criticCommentNode.type(ctx)) return true
    if (node.attrs.threadId) return false // already has threadId from Markdown

    const candidates = bodyLookup.get(node.attrs.comment)
    if (!candidates) return false

    for (const candidate of candidates) {
      if (!usedThreadIds.has(candidate.threadId)) {
        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          threadId: candidate.threadId,
          resolved: candidate.resolved,
        })
        usedThreadIds.add(candidate.threadId)
        changed = true
        break
      }
    }

    return false
  })

  if (changed) {
    view.dispatch(tr)
  }
}

/**
 * Walk the current doc and make sure every criticComment node has both a
 * stable threadId attribute and a matching entry in criticThreadsSlice.
 * New nodes loaded from Markdown (via replaceAll / initial parse) get a
 * fresh threadId and a stub thread synthesised from node.attrs.comment,
 * so downstream UI (sidebar, commands) has something to render.
 * Threads added in-memory by commands are left untouched.
 */
function syncThreadsFromDoc(ctx: Ctx, view: import('prosemirror-view').EditorView) {
  const commentType = criticCommentNode.type(ctx)
  const options = ctx.get(criticMarkupOptionsSlice)

  let tr = view.state.tr
  let trChanged = false
  const threads = new Map(ctx.get(criticThreadsSlice))
  let threadsChanged = false
  const liveThreadIds = new Set<string>()

  view.state.doc.descendants((node, pos) => {
    if (node.type !== commentType) return true

    let threadId: string = node.attrs.threadId
    if (!threadId) {
      threadId = generateId()
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, threadId })
      trChanged = true
    }
    liveThreadIds.add(threadId)

    if (!threads.has(threadId)) {
      const body = String(node.attrs.comment ?? '')
      const rootComment: CriticThreadComment = {
        commentId: generateId(),
        threadId,
        authorId: node.attrs.authorId || options.authorId,
        authorDisplayName: '',
        body,
        createdAt: Date.now(),
      }
      threads.set(threadId, {
        threadId,
        anchorText: body,
        resolved: Boolean(node.attrs.resolved),
        comments: [rootComment],
      })
      threadsChanged = true
    }

    return false
  })

  // Prune stale threads that have no corresponding comment node and carry no
  // user-authored activity (no replies, not resolved). This keeps the sidebar
  // clean across replaceAll() file loads while preserving genuine "orphaned"
  // threads whose anchor text the user deleted.
  for (const [threadId, thread] of threads) {
    if (liveThreadIds.has(threadId)) continue
    const hasActivity = thread.resolved || thread.comments.length > 1
    if (!hasActivity) {
      threads.delete(threadId)
      threadsChanged = true
    }
  }

  if (trChanged) view.dispatch(tr)
  if (threadsChanged) {
    ctx.set(criticThreadsSlice, threads)
    ctx.get(criticThreadsConfigSlice).onThreadsChange?.(threads)
  }
}

function buildChanges(ctx: Ctx, doc: import('prosemirror-model').Node): CriticChange[] {
  const changes: CriticChange[] = []
  // Track substituteGroupIds already emitted so paired marks become one change
  const seenGroupIds = new Set<string>()

  doc.descendants((node, pos) => {
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

    for (const mark of node.marks) {
      // Coalesce paired delete+insert with same substituteGroupId into one substitute change
      const groupId: string = mark.attrs.substituteGroupId ?? ''
      if (
        groupId &&
        (mark.type === criticInsertMark.type(ctx) || mark.type === criticDeleteMark.type(ctx))
      ) {
        if (!seenGroupIds.has(groupId)) {
          seenGroupIds.add(groupId)
          changes.push({
            id: `substitute-${groupId}`,
            type: 'substitute',
            text: node.textContent,
            authorId: mark.attrs.authorId,
            resolved: false,
            from: pos,
            to: pos + node.nodeSize,
          })
        }
        continue
      }

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
