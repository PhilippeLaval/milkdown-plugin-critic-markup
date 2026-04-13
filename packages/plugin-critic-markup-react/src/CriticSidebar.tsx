import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@milkdown/core'
import type { CriticChange, CriticThread } from '@milkdown/plugin-critic-markup'
import {
  criticChangesSlice,
  criticThreadsSlice,
  criticThreadsConfig,
} from '@milkdown/plugin-critic-markup'

export interface CriticSidebarProps {
  editor: React.RefObject<Editor | null>
  groupBy?: 'type' | 'author' | 'none'
  showResolved?: boolean
  currentAuthorId?: string
  onReply?: (threadId: string, body: string, parentCommentId?: string) => void
  onResolve?: (threadId: string) => void
  onDelete?: (threadId: string, commentId: string) => void
  renderAuthorAvatar?: (authorId: string) => React.ReactNode
}

export function CriticSidebar({
  editor,
  groupBy = 'none',
  showResolved = false,
  currentAuthorId = '',
  onReply,
  onResolve,
  onDelete,
  renderAuthorAvatar,
}: CriticSidebarProps): React.ReactElement {
  const [threads, setThreads] = useState<Map<string, CriticThread>>(new Map())
  const [changes, setChanges] = useState<CriticChange[]>([])
  const [replyText, setReplyText] = useState<Record<string, string>>({})

  useEffect(() => {
    const ed = editor.current
    if (!ed) return

    const interval = setInterval(() => {
      try {
        const ctx = ed.ctx
        setThreads(new Map(ctx.get(criticThreadsSlice)))
        setChanges([...ctx.get(criticChangesSlice)])
      } catch {
        // Editor not ready yet
      }
    }, 500)

    return () => clearInterval(interval)
  }, [editor])

  const handleReply = useCallback(
    (threadId: string) => {
      const body = replyText[threadId]
      if (!body?.trim()) return
      onReply?.(threadId, body.trim())
      setReplyText((prev: Record<string, string>) => ({ ...prev, [threadId]: '' }))
    },
    [replyText, onReply],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, threadId: string) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleReply(threadId)
      }
    },
    [handleReply],
  )

  const allEntries: Array<[string, CriticThread]> = [...threads.entries()]
  const threadEntries = allEntries.filter(
    ([, thread]) => showResolved || !thread.resolved,
  )

  // Find orphaned threads (threadId not found in changes)
  const activeThreadIds = new Set(
    changes.filter((c: CriticChange) => c.type === 'comment').map((c: CriticChange) => c.id),
  )
  const orphanedThreads = threadEntries.filter(
    ([id]) => !activeThreadIds.has(id),
  )
  const activeThreads = threadEntries.filter(([id]) =>
    activeThreadIds.has(id),
  )

  const groupThreads = (entries: Array<[string, CriticThread]>) => {
    if (groupBy === 'none') return { all: entries }
    const groups: Record<string, Array<[string, CriticThread]>> = {}
    for (const entry of entries) {
      const key =
        groupBy === 'author'
          ? entry[1].comments[0]?.authorId ?? 'unknown'
          : 'comment'
      if (!groups[key]) groups[key] = []
      groups[key].push(entry)
    }
    return groups
  }

  const grouped = groupThreads(activeThreads)

  return React.createElement(
    'div',
    { className: 'critic-sidebar' },
    // Active threads
    ...Object.entries(grouped).map(([group, entries]) =>
      React.createElement(
        'div',
        { key: group, className: 'critic-sidebar-group' },
        groupBy !== 'none' &&
          React.createElement(
            'h3',
            { className: 'critic-sidebar-group-title' },
            group,
          ),
        ...entries.map(([threadId, thread]) =>
          React.createElement(
            'div',
            {
              key: threadId,
              className: `critic-sidebar-thread${thread.resolved ? ' critic-sidebar-thread--resolved' : ''}`,
            },
            // Thread header
            React.createElement(
              'div',
              { className: 'critic-sidebar-thread-header' },
              React.createElement('span', null, '\u{1F4AC}'),
              React.createElement(
                'span',
                { className: 'critic-sidebar-thread-summary' },
                thread.comments[0]?.body?.substring(0, 60) ?? '',
              ),
              !thread.resolved &&
                React.createElement(
                  'button',
                  {
                    className: 'critic-sidebar-resolve-btn',
                    onClick: () => onResolve?.(threadId),
                  },
                  'Resolve',
                ),
            ),
            // Comments
            ...thread.comments.map((comment) =>
              React.createElement(
                'div',
                {
                  key: comment.commentId,
                  className: `critic-sidebar-comment${comment.parentCommentId ? ' critic-sidebar-reply' : ''}`,
                },
                React.createElement(
                  'div',
                  { className: 'critic-sidebar-comment-header' },
                  renderAuthorAvatar
                    ? renderAuthorAvatar(comment.authorId)
                    : React.createElement('span', null, '\u{1F464}'),
                  React.createElement(
                    'span',
                    { className: 'critic-sidebar-author' },
                    comment.authorDisplayName || comment.authorId,
                  ),
                  React.createElement(
                    'span',
                    { className: 'critic-sidebar-time' },
                    formatTime(comment.createdAt),
                  ),
                  comment.authorId === currentAuthorId &&
                    React.createElement(
                      'button',
                      {
                        className: 'critic-sidebar-delete-btn',
                        onClick: () =>
                          onDelete?.(threadId, comment.commentId),
                      },
                      '\u2715',
                    ),
                ),
                React.createElement(
                  'div',
                  { className: 'critic-sidebar-comment-body' },
                  comment.body,
                ),
                comment.editedAt &&
                  React.createElement(
                    'span',
                    { className: 'critic-sidebar-edited' },
                    '(edited)',
                  ),
              ),
            ),
            // Reply input
            !thread.resolved &&
              React.createElement(
                'div',
                { className: 'critic-sidebar-reply-input' },
                React.createElement('textarea', {
                  className: 'critic-sidebar-textarea',
                  placeholder: 'Reply\u2026',
                  value: replyText[threadId] ?? '',
                  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setReplyText((prev: Record<string, string>) => ({
                      ...prev,
                      [threadId]: e.target.value,
                    })),
                  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) =>
                    handleKeyDown(e, threadId),
                }),
              ),
          ),
        ),
      ),
    ),
    // Orphaned threads
    orphanedThreads.length > 0 &&
      React.createElement(
        'div',
        { className: 'critic-sidebar-orphaned' },
        React.createElement(
          'h3',
          { className: 'critic-sidebar-group-title' },
          'Orphaned comments',
        ),
        ...orphanedThreads.map(([threadId, thread]) =>
          React.createElement(
            'div',
            {
              key: threadId,
              className: 'critic-sidebar-thread critic-sidebar-thread--orphaned',
            },
            React.createElement(
              'div',
              { className: 'critic-sidebar-thread-header' },
              React.createElement('span', null, '\u{1F4AC}'),
              React.createElement(
                'span',
                null,
                thread.comments[0]?.body?.substring(0, 60) ?? '',
              ),
            ),
          ),
        ),
      ),
  )
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
