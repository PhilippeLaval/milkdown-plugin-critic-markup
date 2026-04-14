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

    it('should not hang or crash on multi-line insertion', () => {
      // Regression: previously a line ending inside a data token left micromark's
      // subtokenize in a broken state and either hung or threw a splice-buffer
      // range error (reproduced by THESIS-ALIGNMENT-Report-reviewed.md).
      expect(roundTrip('{++line one\nline two++}')).toBe('{++line one\nline two++}')
    })

    it('should round-trip multi-line insertion containing a table', () => {
      const input = [
        '{++## Ninja Scores Summary',
        '| Metric | Value |',
        '|--------|-------|',
        '| Team | 24.7 / 100 |',
        '| Growth | 0.34 / 1.0 |++}',
      ].join('\n')
      expect(roundTrip(input)).toBe(input)
    })

    it('should round-trip multi-line substitution and comment', () => {
      expect(roundTrip('{~~old line 1\nold line 2~>new line 1\nnew line 2~~}')).toBe(
        '{~~old line 1\nold line 2~>new line 1\nnew line 2~~}',
      )
      expect(roundTrip('{>>comment\nspanning\nlines<<}')).toBe('{>>comment\nspanning\nlines<<}')
    })

    it('should parse inline markdown inside critic spans', () => {
      const tree = parse('{++**88 employees** (Ninja verified)++}')
      const paragraph = tree.children[0]
      if (paragraph.type !== 'paragraph') throw new Error('expected paragraph')
      const insert = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticInsert',
      ) as { type: string; children: Array<{ type: string }> } | undefined
      expect(insert).toBeDefined()
      const types = insert!.children.map((c) => c.type)
      expect(types).toContain('strong')
    })

    it('should round-trip inline markdown inside insert/delete/highlight', () => {
      expect(roundTrip('{++**bold** text++}')).toBe('{++**bold** text++}')
      expect(roundTrip('{--*italic*--}')).toBe('{--*italic*--}')
      expect(roundTrip('{==[link](https://example.com)==}')).toBe(
        '{==[link](https://example.com)==}',
      )
    })

    it('should round-trip inline markdown inside substitution', () => {
      expect(roundTrip('{~~**old**~>**new**~~}')).toBe('{~~**old**~>**new**~~}')
    })

    it('should parse inline markdown on each line of a multi-line critic span', () => {
      // Regression: THESIS-ALIGNMENT report has a multi-line insertion that
      // contains `**#Mined**` and `**December 2018**`. Even though the span
      // also contains a heading line (which cannot be represented as phrasing),
      // the per-line inline markdown should still parse into real mdast nodes.
      const input =
        '{++## Pipeline Status\nSESAMm is at **#Mined** stage since **December 2018**.++}'
      const tree = parse(input)
      const paragraph = tree.children[0]
      if (paragraph.type !== 'paragraph') throw new Error('expected paragraph')
      const insert = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticInsert',
      ) as { type: string; children: Array<{ type: string }> } | undefined
      expect(insert).toBeDefined()
      const strongCount = insert!.children.filter((c) => c.type === 'strong').length
      expect(strongCount).toBe(2)
    })

    it('should round-trip multi-line insertion with inline bold', () => {
      const input =
        '{++## Pipeline Status\nSESAMm is at **#Mined** stage since **December 2018**.++}'
      expect(roundTrip(input)).toBe(input)
    })

    it('should round-trip a critic span whose line begins with a list marker', () => {
      // Regression: `- **text**` would parse as a block list, fall back to a
      // literal text node, and mdast-util-to-markdown would then escape the
      // `**` as `\*\*` — with each extra round-trip doubling the backslashes.
      const input =
        '{++- **Ninja Score Discrepancies**: narrative is bullish while scores are moderate.++}'
      expect(roundTrip(input)).toBe(input)
      // Idempotence: a second round-trip must not add more escapes.
      expect(roundTrip(roundTrip(input))).toBe(input)
    })

    it('should parse inline markdown inside a list-marker critic line', () => {
      const tree = parse('{++- **bold** text++}')
      const paragraph = tree.children[0]
      if (paragraph.type !== 'paragraph') throw new Error('expected paragraph')
      const insert = paragraph.children.find(
        (c: { type: string }) => c.type === 'criticInsert',
      ) as { type: string; children: Array<{ type: string }> } | undefined
      expect(insert).toBeDefined()
      const types = insert!.children.map((c) => c.type)
      expect(types).toContain('strong')
    })

    it('should serialize a Milkdown-shaped mdast tree correctly', () => {
      // Milkdown's serializer builds marks as nested mdast nodes with
      // `isMark: true`. Reproduce what Milkdown would emit for `{++**bold**++}`.
      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'criticInsert',
                isMark: true,
                children: [
                  {
                    type: 'strong',
                    isMark: true,
                    children: [{ type: 'text', value: 'bold' }],
                  },
                ],
              },
            ],
          },
        ],
      }
      const out = serialize(tree as never).trim()
      expect(out).toBe('{++**bold**++}')
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
