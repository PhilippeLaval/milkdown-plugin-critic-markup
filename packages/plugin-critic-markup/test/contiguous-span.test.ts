import { describe, it, expect } from 'vitest'

/**
 * Tests that findMarkStart/findMarkEnd compute contiguous spans
 * and stop at gaps, preventing cross-range operations.
 *
 * We verify the algorithm by testing it against simulated parent
 * structures matching ProseMirror's Fragment/Node model.
 */
describe('Contiguous mark span logic', () => {
  // Simulate the contiguous-span algorithm from commands.ts
  function findContiguousSpan(
    children: Array<{ text: string; hasMark: boolean }>,
    targetIndex: number,
  ): { start: number; end: number } {
    // Walk backward from targetIndex
    let startIdx = targetIndex
    for (let i = targetIndex; i >= 0; i--) {
      if (!children[i].hasMark) break
      startIdx = i
    }

    // Walk forward from targetIndex
    let endIdx = targetIndex
    for (let i = targetIndex; i < children.length; i++) {
      if (!children[i].hasMark) break
      endIdx = i
    }

    // Compute character offsets
    let startPos = 0
    for (let i = 0; i < startIdx; i++) startPos += children[i].text.length
    let endPos = 0
    for (let i = 0; i <= endIdx; i++) endPos += children[i].text.length

    return { start: startPos, end: endPos }
  }

  it('should find the span of a single marked range', () => {
    const children = [
      { text: 'Hello ', hasMark: false },
      { text: 'world', hasMark: true },
      { text: ' end', hasMark: false },
    ]
    const span = findContiguousSpan(children, 1)
    expect(span).toEqual({ start: 6, end: 11 })
  })

  it('should not cross a gap between two separate marks', () => {
    // "AAA plain BBB" — two separate marked ranges
    const children = [
      { text: 'AAA', hasMark: true },   // 0-3
      { text: ' plain ', hasMark: false }, // 3-10
      { text: 'BBB', hasMark: true },   // 10-13
    ]

    // Clicking in AAA should only find AAA
    const spanA = findContiguousSpan(children, 0)
    expect(spanA).toEqual({ start: 0, end: 3 })

    // Clicking in BBB should only find BBB
    const spanB = findContiguousSpan(children, 2)
    expect(spanB).toEqual({ start: 10, end: 13 })
  })

  it('should span multiple adjacent marked nodes', () => {
    // "Hello " + "world" (both marked, different text nodes due to other marks)
    const children = [
      { text: 'pre ', hasMark: false },
      { text: 'Hello ', hasMark: true },
      { text: 'world', hasMark: true },
      { text: ' post', hasMark: false },
    ]

    const span = findContiguousSpan(children, 1)
    expect(span).toEqual({ start: 4, end: 15 })

    const span2 = findContiguousSpan(children, 2)
    expect(span2).toEqual({ start: 4, end: 15 })
  })

  it('should handle mark at start of paragraph', () => {
    const children = [
      { text: 'marked', hasMark: true },
      { text: ' rest', hasMark: false },
    ]
    const span = findContiguousSpan(children, 0)
    expect(span).toEqual({ start: 0, end: 6 })
  })

  it('should handle mark at end of paragraph', () => {
    const children = [
      { text: 'start ', hasMark: false },
      { text: 'marked', hasMark: true },
    ]
    const span = findContiguousSpan(children, 1)
    expect(span).toEqual({ start: 6, end: 12 })
  })

  it('should handle three separate marks without cross-contamination', () => {
    const children = [
      { text: 'A', hasMark: true },
      { text: ' ', hasMark: false },
      { text: 'B', hasMark: true },
      { text: ' ', hasMark: false },
      { text: 'C', hasMark: true },
    ]

    expect(findContiguousSpan(children, 0)).toEqual({ start: 0, end: 1 })
    expect(findContiguousSpan(children, 2)).toEqual({ start: 2, end: 3 })
    expect(findContiguousSpan(children, 4)).toEqual({ start: 4, end: 5 })
  })

  it('should span across inline non-text nodes (hard breaks, atoms) when they carry the mark', () => {
    // Simulates: "text" + [hard_break with mark] + "more text"
    // The hasMark check applies to any node type, not just text
    const children = [
      { text: 'before', hasMark: true },
      { text: '\n', hasMark: true },  // hard break (inline atom with mark)
      { text: 'after', hasMark: true },
    ]
    const span = findContiguousSpan(children, 0)
    expect(span).toEqual({ start: 0, end: 12 }) // "before" + "\n" + "after"
  })

  it('should stop at inline non-text node WITHOUT the mark', () => {
    const children = [
      { text: 'marked', hasMark: true },
      { text: '*', hasMark: false },  // inline atom without mark
      { text: 'also marked', hasMark: true },
    ]
    // Should only find "marked", not cross the unmarked atom
    expect(findContiguousSpan(children, 0)).toEqual({ start: 0, end: 6 })
    expect(findContiguousSpan(children, 2)).toEqual({ start: 7, end: 18 })
  })
})
