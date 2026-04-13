import { describe, it, expect } from 'vitest'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import { criticMarkup } from 'micromark-extension-critic-markup'
import { criticMarkupFromMarkdown, criticMarkupToMarkdown } from 'mdast-util-critic-markup'

function parse(input: string) {
  return fromMarkdown(input, {
    extensions: [criticMarkup()],
    mdastExtensions: [criticMarkupFromMarkdown()],
  })
}

function serialize(tree: ReturnType<typeof parse>) {
  return toMarkdown(tree, {
    extensions: [criticMarkupToMarkdown()],
  }).trim()
}

/**
 * Tests that threadId is preserved in the Markdown via the [@critic:threadId] prefix
 * and survives round-trips, eliminating the need for fragile reattachment heuristics.
 */
describe('Thread identity in Markdown ([@critic:threadId] prefix)', () => {
  it('should parse threadId from [@critic:threadId] prefix in comment', () => {
    const tree = parse('{>>[@critic:abc-123] We should revisit this<<}')
    const paragraph = tree.children[0]
    if (paragraph.type === 'paragraph') {
      const comment = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticComment',
      ) as { type: string; value: string; threadId?: string } | undefined
      expect(comment).toBeDefined()
      expect(comment!.threadId).toBe('abc-123')
      expect(comment!.value).toBe('We should revisit this')
    }
  })

  it('should parse comment without threadId prefix', () => {
    const tree = parse('{>>plain comment<<}')
    const paragraph = tree.children[0]
    if (paragraph.type === 'paragraph') {
      const comment = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticComment',
      ) as { type: string; value: string; threadId?: string } | undefined
      expect(comment).toBeDefined()
      expect(comment!.threadId).toBeUndefined()
      expect(comment!.value).toBe('plain comment')
    }
  })

  it('should serialize threadId as [@critic:threadId] prefix', () => {
    const tree = parse('{>>[@critic:thread-xyz] Check this<<}')
    const result = serialize(tree)
    expect(result).toBe('{>>[@critic:thread-xyz] Check this<<}')
  })

  it('should serialize comment without threadId as plain comment', () => {
    const tree = parse('{>>no thread<<}')
    const result = serialize(tree)
    expect(result).toBe('{>>no thread<<}')
  })

  it('should round-trip threadId through parse → serialize', () => {
    const input = '{>>[@critic:uuid-111] We should revisit this assumption<<}'
    expect(serialize(parse(input))).toBe(input)
  })

  it('should round-trip multiple comments with different threadIds', () => {
    const input = 'Text {>>[@critic:t1] First<<} middle {>>[@critic:t2] Second<<} end'
    expect(serialize(parse(input))).toBe(input)
  })

  it('should handle duplicate comment bodies with different threadIds', () => {
    const tree = parse('A {>>[@critic:id-1] Same text<<} B {>>[@critic:id-2] Same text<<} C')
    const paragraph = tree.children[0]
    if (paragraph.type === 'paragraph') {
      const comments = paragraph.children.filter(
        (c: { type: string }) => c.type === 'criticComment',
      ) as Array<{ threadId?: string; value: string }>
      expect(comments).toHaveLength(2)
      expect(comments[0].threadId).toBe('id-1')
      expect(comments[1].threadId).toBe('id-2')
      expect(comments[0].value).toBe('Same text')
      expect(comments[1].value).toBe('Same text')
    }
  })

  it('should survive full round-trip: create → serialize → reload with thread identity intact', () => {
    // Simulate: document with two comments, each with a unique threadId
    const markdown = 'The market grew {>>[@critic:uuid-aaa] Check this assumption<<} last year and {>>[@critic:uuid-bbb] Needs citation<<} significantly.'
    const tree = parse(markdown)
    const serialized = serialize(tree)

    // Reload from serialized markdown
    const reloaded = parse(serialized)
    const paragraph = reloaded.children[0]
    if (paragraph.type === 'paragraph') {
      const comments = paragraph.children.filter(
        (c: { type: string }) => c.type === 'criticComment',
      ) as Array<{ threadId?: string; value: string }>

      expect(comments[0].threadId).toBe('uuid-aaa')
      expect(comments[0].value).toBe('Check this assumption')
      expect(comments[1].threadId).toBe('uuid-bbb')
      expect(comments[1].value).toBe('Needs citation')
    }
  })

  it('should handle threadId with special characters', () => {
    const input = '{>>[@critic:thread_2024-01-15_review] Important note<<}'
    const tree = parse(input)
    const paragraph = tree.children[0]
    if (paragraph.type === 'paragraph') {
      const comment = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticComment',
      ) as { threadId?: string; value: string } | undefined
      expect(comment!.threadId).toBe('thread_2024-01-15_review')
    }
    expect(serialize(tree)).toBe(input)
  })

  it('should NOT parse [@username] as a threadId (no critic: prefix)', () => {
    const tree = parse('{>>[@alice] please verify this<<}')
    const paragraph = tree.children[0]
    if (paragraph.type === 'paragraph') {
      const comment = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticComment',
      ) as { threadId?: string; value: string } | undefined
      expect(comment!.threadId).toBeUndefined()
      expect(comment!.value).toBe('[@alice] please verify this')
    }
  })

  it('should round-trip [@username] comments without mangling', () => {
    const input = '{>>[@alice] please verify this<<}'
    expect(serialize(parse(input))).toBe(input)
  })

  it('should escape and round-trip literal [@critic:...] text in comments', () => {
    // A comment whose body literally starts with [@critic:...] gets escaped
    const tree = parse('{>>normal comment<<}')
    const paragraph = tree.children[0]
    if (paragraph.type === 'paragraph') {
      // Manually set value to something that starts with [@critic:
      const comment = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticComment',
      ) as { value: string; threadId?: string }
      comment.value = '[@critic:fake] this is literal text'
      comment.threadId = undefined

      const serialized = serialize(tree)
      // Serializer should escape it
      expect(serialized).toContain('\\[@critic:fake]')

      // Re-parsing should recover the original literal text
      const reparsed = parse(serialized)
      const p2 = reparsed.children[0]
      if (p2.type === 'paragraph') {
        const c2 = p2.children.find(
          (c: { type: string }) => c.type === 'criticComment',
        ) as { value: string; threadId?: string }
        expect(c2.threadId).toBeUndefined()
        expect(c2.value).toBe('[@critic:fake] this is literal text')
      }
    }
  })

  it('should round-trip literal backslash-prefixed [@critic:] text', () => {
    // A comment whose body starts with \[@critic: (literal backslash)
    const tree = parse('{>>normal<<}')
    const paragraph = tree.children[0]
    if (paragraph.type === 'paragraph') {
      const comment = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticComment',
      ) as { value: string; threadId?: string }
      comment.value = '\\[@critic:test] literal backslash'
      comment.threadId = undefined

      const serialized = serialize(tree)
      const reparsed = parse(serialized)
      const p2 = reparsed.children[0]
      if (p2.type === 'paragraph') {
        const c2 = p2.children.find(
          (c: { type: string }) => c.type === 'criticComment',
        ) as { value: string; threadId?: string }
        expect(c2.threadId).toBeUndefined()
        expect(c2.value).toBe('\\[@critic:test] literal backslash')
      }
    }
  })
})
