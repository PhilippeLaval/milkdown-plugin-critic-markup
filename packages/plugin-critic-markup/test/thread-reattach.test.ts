import { describe, it, expect } from 'vitest'

/**
 * Tests that the lifecycle plugin's reattachThreads logic correctly
 * matches hydrated threads to parsed comment nodes by root comment body.
 *
 * Since we can't easily spin up a full Milkdown editor in unit tests,
 * we test the matching algorithm directly.
 */
describe('Thread reattachment logic', () => {
  // Simulate the reattachment algorithm from lifecycle.ts
  function reattach(
    commentBodies: string[],
    threads: Array<{ threadId: string; rootBody: string; resolved: boolean }>,
  ) {
    // Build lookup: body -> threads (same logic as lifecycle.ts)
    const bodyToThreads = new Map<string, typeof threads>()
    for (const thread of threads) {
      const list = bodyToThreads.get(thread.rootBody) ?? []
      list.push(thread)
      bodyToThreads.set(thread.rootBody, list)
    }

    const bodyIndexes = new Map<string, number>()
    const results: Array<{ comment: string; threadId: string | null; resolved: boolean }> = []

    for (const body of commentBodies) {
      const candidates = bodyToThreads.get(body)
      if (!candidates || candidates.length === 0) {
        results.push({ comment: body, threadId: null, resolved: false })
        continue
      }

      const idx = bodyIndexes.get(body) ?? 0
      if (idx >= candidates.length) {
        results.push({ comment: body, threadId: null, resolved: false })
        continue
      }

      const thread = candidates[idx]
      bodyIndexes.set(body, idx + 1)
      results.push({ comment: body, threadId: thread.threadId, resolved: thread.resolved })
    }

    return results
  }

  it('should match a single comment to its thread by body text', () => {
    const results = reattach(
      ['We should revisit this'],
      [{ threadId: 'thread-abc', rootBody: 'We should revisit this', resolved: false }],
    )

    expect(results).toEqual([
      { comment: 'We should revisit this', threadId: 'thread-abc', resolved: false },
    ])
  })

  it('should preserve resolved state from hydrated thread', () => {
    const results = reattach(
      ['Done reviewing'],
      [{ threadId: 'thread-xyz', rootBody: 'Done reviewing', resolved: true }],
    )

    expect(results[0].resolved).toBe(true)
    expect(results[0].threadId).toBe('thread-xyz')
  })

  it('should handle multiple comments with different bodies', () => {
    const results = reattach(
      ['First comment', 'Second comment'],
      [
        { threadId: 'thread-1', rootBody: 'First comment', resolved: false },
        { threadId: 'thread-2', rootBody: 'Second comment', resolved: true },
      ],
    )

    expect(results).toEqual([
      { comment: 'First comment', threadId: 'thread-1', resolved: false },
      { comment: 'Second comment', threadId: 'thread-2', resolved: true },
    ])
  })

  it('should handle duplicate comment bodies in document order', () => {
    const results = reattach(
      ['Same text', 'Same text'],
      [
        { threadId: 'thread-a', rootBody: 'Same text', resolved: false },
        { threadId: 'thread-b', rootBody: 'Same text', resolved: true },
      ],
    )

    // First occurrence matches first thread, second matches second
    expect(results[0].threadId).toBe('thread-a')
    expect(results[1].threadId).toBe('thread-b')
  })

  it('should return null threadId for unmatched comments', () => {
    const results = reattach(
      ['New comment with no thread'],
      [],
    )

    expect(results[0].threadId).toBeNull()
  })

  it('should handle orphaned threads (no matching comment in doc)', () => {
    const results = reattach(
      ['Comment A'],
      [
        { threadId: 'thread-1', rootBody: 'Comment A', resolved: false },
        { threadId: 'thread-orphan', rootBody: 'Deleted comment', resolved: false },
      ],
    )

    // Only Comment A is matched; the orphaned thread is not in results
    expect(results).toHaveLength(1)
    expect(results[0].threadId).toBe('thread-1')
  })

  it('should survive full round-trip scenario: serialize → reload → rehydrate', () => {
    // Simulate: original doc had 2 comments with threads
    const originalThreads = [
      { threadId: 'uuid-111', rootBody: 'Check this assumption', resolved: false },
      { threadId: 'uuid-222', rootBody: 'Needs citation', resolved: true },
    ]

    // After Markdown serialization, comment nodes lose threadId.
    // On reload, we parse from Markdown and get comment bodies only.
    const parsedCommentBodies = ['Check this assumption', 'Needs citation']

    // Reattach hydrated threads to parsed comments
    const results = reattach(parsedCommentBodies, originalThreads)

    // Thread identity must survive the round-trip
    expect(results[0].threadId).toBe('uuid-111')
    expect(results[0].resolved).toBe(false)
    expect(results[1].threadId).toBe('uuid-222')
    expect(results[1].resolved).toBe(true)
  })
})
