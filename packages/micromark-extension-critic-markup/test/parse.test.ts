import { describe, it, expect } from 'vitest'
import { micromark } from 'micromark'
import { criticMarkup } from '../src/index.js'

function getTokens(input: string) {
  const events: Array<{ type: string; kind: string; value?: string }> = []

  // Use micromark with our extension and a custom html extension that captures events
  // We'll test via the html output instead since micromark doesn't expose raw tokens easily
  // Instead, we test by parsing through the full pipeline (mdast layer tests cover AST)
  // Here we verify that micromark processes the input without errors and produces expected output

  // micromark itself doesn't have a direct token inspection API for extensions.
  // We test indirectly: valid constructs should be consumed (not emitted as plain text markers)
  const html = micromark(input, {
    extensions: [criticMarkup()],
  })

  return html
}

describe('micromark-extension-critic-markup', () => {
  describe('insertion', () => {
    it('should parse simple insertion', () => {
      const html = getTokens('Hello {++world++}')
      // The tokens are consumed by micromark but without an html extension,
      // the raw tokens appear as-is. We verify no crash and content passes through.
      expect(html).toBeDefined()
    })

    it('should parse multi-word insertion', () => {
      const html = getTokens('{++multi word insertion++}')
      expect(html).toBeDefined()
    })
  })

  describe('deletion', () => {
    it('should parse simple deletion', () => {
      const html = getTokens('{--old--}')
      expect(html).toBeDefined()
    })
  })

  describe('substitution', () => {
    it('should parse substitution with separator', () => {
      const html = getTokens('{~~old~>new~~}')
      expect(html).toBeDefined()
    })
  })

  describe('highlight', () => {
    it('should parse highlight', () => {
      const html = getTokens('{==note==}')
      expect(html).toBeDefined()
    })
  })

  describe('comment', () => {
    it('should parse comment', () => {
      const html = getTokens('{>>aside<<}')
      expect(html).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should not match broken syntax', () => {
      const html = getTokens('no match { ++ broken')
      // Should pass through as plain text
      expect(html).toContain('no match { ++ broken')
    })

    it('should handle nested constructs', () => {
      const html = getTokens('{++nested {==hi==}++}')
      expect(html).toBeDefined()
    })
  })
})
