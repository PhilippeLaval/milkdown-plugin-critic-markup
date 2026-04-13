import { describe, it, expect } from 'vitest'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import { criticMarkup } from 'micromark-extension-critic-markup'
import { criticMarkupFromMarkdown } from '../src/from-markdown.js'
import { criticMarkupToMarkdown } from '../src/to-markdown.js'

function parse(input: string) {
  return fromMarkdown(input, {
    extensions: [criticMarkup()],
    mdastExtensions: [criticMarkupFromMarkdown()],
  })
}

function serialize(tree: ReturnType<typeof parse>) {
  return toMarkdown(tree, {
    extensions: [criticMarkupToMarkdown()],
  })
}

function roundTrip(input: string): string {
  const tree = parse(input)
  return serialize(tree).trim()
}

describe('mdast-util-critic-markup', () => {
  describe('fromMarkdown (parse)', () => {
    it('should parse insertion', () => {
      const tree = parse('Hello {++world++}')
      const paragraph = tree.children[0]
      expect(paragraph.type).toBe('paragraph')
      if (paragraph.type === 'paragraph') {
        const insert = paragraph.children.find(
          (c: { type: string }) => c.type === 'criticInsert',
        )
        expect(insert).toBeDefined()
        expect(insert!.type).toBe('criticInsert')
      }
    })

    it('should parse deletion', () => {
      const tree = parse('{--removed--}')
      const paragraph = tree.children[0]
      if (paragraph.type === 'paragraph') {
        const del = paragraph.children.find(
          (c: { type: string }) => c.type === 'criticDelete',
        )
        expect(del).toBeDefined()
      }
    })

    it('should parse substitution', () => {
      const tree = parse('{~~old~>new~~}')
      const paragraph = tree.children[0]
      if (paragraph.type === 'paragraph') {
        const sub = paragraph.children.find(
          (c: { type: string }) => c.type === 'criticSubstitute',
        ) as { type: string; deleteChildren: unknown[]; insertChildren: unknown[] } | undefined
        expect(sub).toBeDefined()
        expect(sub!.deleteChildren).toBeDefined()
        expect(sub!.insertChildren).toBeDefined()
      }
    })

    it('should parse highlight', () => {
      const tree = parse('{==important==}')
      const paragraph = tree.children[0]
      if (paragraph.type === 'paragraph') {
        const highlight = paragraph.children.find(
          (c: { type: string }) => c.type === 'criticHighlight',
        )
        expect(highlight).toBeDefined()
      }
    })

    it('should parse comment', () => {
      const tree = parse('{>>this is a comment<<}')
      const paragraph = tree.children[0]
      if (paragraph.type === 'paragraph') {
        const comment = paragraph.children.find(
          (c: { type: string }) => c.type === 'criticComment',
        ) as { type: string; value: string } | undefined
        expect(comment).toBeDefined()
        expect(comment!.value).toBe('this is a comment')
      }
    })
  })

  describe('toMarkdown (serialize)', () => {
    it('should serialize insertion', () => {
      const result = roundTrip('Hello {++world++}')
      expect(result).toBe('Hello {++world++}')
    })

    it('should serialize deletion', () => {
      const result = roundTrip('{--removed--}')
      expect(result).toBe('{--removed--}')
    })

    it('should serialize substitution', () => {
      const result = roundTrip('{~~old~>new~~}')
      expect(result).toBe('{~~old~>new~~}')
    })

    it('should serialize highlight', () => {
      const result = roundTrip('{==important==}')
      expect(result).toBe('{==important==}')
    })

    it('should serialize comment', () => {
      const result = roundTrip('{>>note<<}')
      expect(result).toBe('{>>note<<}')
    })
  })

  describe('round-trip', () => {
    const cases = [
      '{++inserted text++}',
      '{--deleted text--}',
      '{~~old text~>new text~~}',
      '{==highlighted text==}',
      '{>>comment text<<}',
      '{++multi word insertion++}',
      'Hello {++world++} there',
    ]

    for (const input of cases) {
      it(`should round-trip: ${input}`, () => {
        expect(roundTrip(input)).toBe(input)
      })
    }
  })

  describe('edge cases', () => {
    it('should preserve whitespace inside delimiters', () => {
      const result = roundTrip('{++ spaced ++}')
      expect(result).toBe('{++ spaced ++}')
    })

    it('should handle empty document', () => {
      const tree = parse('')
      expect(tree.children).toHaveLength(0)
    })

    it('should handle comment with special characters (XSS safe)', () => {
      const tree = parse('{>> <b>xss</b> <<}')
      const paragraph = tree.children[0]
      if (paragraph.type === 'paragraph') {
        const comment = paragraph.children.find(
          (c: { type: string }) => c.type === 'criticComment',
        ) as { type: string; value: string } | undefined
        expect(comment).toBeDefined()
        // Value stored as plain text
        expect(comment!.value).toBe(' <b>xss</b> ')
      }
    })
  })
})
