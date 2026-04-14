import { $prose } from '@milkdown/utils'
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Ctx } from '@milkdown/ctx'
import { criticInsertMark, criticDeleteMark, criticHighlightMark, criticCommentNode } from './schema.js'
import { criticMarkupOptionsSlice, criticThreadsSlice } from './commands.js'
import { commandsCtx } from '@milkdown/core'

function isCriticMark(mark: import('prosemirror-model').Mark, ctx: Ctx): boolean {
  return (
    mark.type === criticInsertMark.type(ctx) ||
    mark.type === criticDeleteMark.type(ctx) ||
    mark.type === criticHighlightMark.type(ctx)
  )
}

function getMarkTypeName(mark: import('prosemirror-model').Mark, ctx: Ctx): string {
  if (mark.type === criticInsertMark.type(ctx)) return 'insert'
  if (mark.type === criticDeleteMark.type(ctx)) return 'delete'
  if (mark.type === criticHighlightMark.type(ctx)) return 'highlight'
  return 'unknown'
}

function renderToolbarWidget(ctx: Ctx, markTypeName: string, pos: number): (view: import('prosemirror-view').EditorView) => HTMLElement {
  return (view) => {
    const container = document.createElement('span')
    container.className = 'critic-toolbar'
    container.contentEditable = 'false'

    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'critic-toolbar-btn critic-toolbar-accept'
    acceptBtn.textContent = '\u2713 Accept'
    acceptBtn.type = 'button'
    acceptBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.get(commandsCtx).call('AcceptChange', pos)
    })

    const rejectBtn = document.createElement('button')
    rejectBtn.className = 'critic-toolbar-btn critic-toolbar-reject'
    rejectBtn.textContent = '\u2717 Reject'
    rejectBtn.type = 'button'
    rejectBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.get(commandsCtx).call('RejectChange', pos)
    })

    container.appendChild(acceptBtn)
    container.appendChild(rejectBtn)

    // Author chip
    const options = ctx.get(criticMarkupOptionsSlice)
    if (options.authorId) {
      const authorChip = document.createElement('span')
      authorChip.className = 'critic-toolbar-author'
      authorChip.textContent = `\u{1F464} ${options.authorId}`
      container.appendChild(authorChip)
    }

    return container
  }
}

function renderCommentToolbarWidget(
  ctx: Ctx,
  threadId: string,
  body: string,
): (view: import('prosemirror-view').EditorView) => HTMLElement {
  return (view) => {
    const container = document.createElement('span')
    container.className = 'critic-toolbar'
    container.contentEditable = 'false'

    const threads = ctx.get(criticThreadsSlice)
    const thread = threads.get(threadId)
    const replyCount = thread ? thread.comments.length - 1 : 0

    // Prefer the thread's first comment body if a thread exists; otherwise
    // fall back to the body stored on the node itself.
    const summaryText = thread?.comments[0]?.body ?? body

    if (summaryText) {
      const bodyEl = document.createElement('span')
      bodyEl.className = 'critic-toolbar-comment-body'
      bodyEl.textContent = summaryText
      container.appendChild(bodyEl)
    }

    const chipBtn = document.createElement('span')
    chipBtn.className = 'critic-toolbar-chip'
    chipBtn.textContent = replyCount > 0 ? `\u{1F4AC} ${replyCount} replies` : '\u{1F4AC} No replies yet'

    const resolveBtn = document.createElement('button')
    resolveBtn.className = 'critic-toolbar-btn critic-toolbar-resolve'
    resolveBtn.textContent = 'Resolve'
    resolveBtn.type = 'button'
    resolveBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.get(commandsCtx).call('ResolveThread', { threadId, resolved: true })
    })

    container.appendChild(chipBtn)
    container.appendChild(resolveBtn)

    return container
  }
}

export const criticDecorationsPlugin = $prose((ctx) => {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = []
        const { doc, selection } = state

        doc.descendants((node, pos) => {
          // Check marks for critic marks
          for (const mark of node.marks) {
            if (!isCriticMark(mark, ctx)) continue
            const isActive =
              selection.from >= pos && selection.to <= pos + node.nodeSize
            if (isActive) {
              decorations.push(
                Decoration.inline(pos, pos + node.nodeSize, {
                  class: 'critic-active',
                }),
              )

              const options = ctx.get(criticMarkupOptionsSlice)
              if (options.enableFloatingToolbar) {
                decorations.push(
                  Decoration.widget(
                    pos + node.nodeSize,
                    renderToolbarWidget(ctx, getMarkTypeName(mark, ctx), pos),
                    { side: 1 },
                  ),
                )
              }
            }
          }

          // Critic comment nodes
          if (node.type === criticCommentNode.type(ctx)) {
            const classes = node.attrs.resolved
              ? 'critic-comment critic-comment--resolved'
              : 'critic-comment'
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, { class: classes }),
            )

            const isActive =
              selection.from >= pos && selection.to <= pos + node.nodeSize
            if (isActive) {
              const options = ctx.get(criticMarkupOptionsSlice)
              if (options.enableFloatingToolbar) {
                decorations.push(
                  Decoration.widget(
                    pos + node.nodeSize,
                    renderCommentToolbarWidget(ctx, node.attrs.threadId, node.attrs.comment),
                    { side: 1 },
                  ),
                )
              }
            }
          }
        })

        return DecorationSet.create(doc, decorations)
      },
      handleKeyDown(view, event) {
        // Alt+Enter = Accept, Alt+Backspace = Reject
        if (event.altKey && event.key === 'Enter') {
          ctx.get(commandsCtx).call('AcceptChange')
          return true
        }
        if (event.altKey && event.key === 'Backspace') {
          ctx.get(commandsCtx).call('RejectChange')
          return true
        }
        return false
      },
    },
  })
})
