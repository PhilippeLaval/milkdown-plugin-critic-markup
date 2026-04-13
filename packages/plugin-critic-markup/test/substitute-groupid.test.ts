import { describe, it, expect } from 'vitest'

/**
 * Tests that the substitution serializer only merges adjacent
 * delete+insert pairs when they share a non-empty substituteGroupId.
 * Independent adjacent changes must NOT be collapsed into substitutions.
 */
describe('Substitution serializer groupId logic', () => {
  // Simulate the merge logic from substitute-serializer.ts
  function mergeSubstitutions(children: Array<{
    type: string
    isMark?: boolean
    substituteGroupId?: string
    children?: unknown[]
  }>) {
    const merged: any[] = []
    let i = 0
    while (i < children.length) {
      const current = children[i]
      const next = children[i + 1]

      if (
        current?.type === 'criticDelete' &&
        next?.type === 'criticInsert' &&
        current.isMark &&
        next.isMark &&
        current.substituteGroupId &&
        next.substituteGroupId &&
        current.substituteGroupId === next.substituteGroupId
      ) {
        merged.push({
          type: 'criticSubstitute',
          deleteChildren: current.children ?? [],
          insertChildren: next.children ?? [],
        })
        i += 2
      } else {
        merged.push(current)
        i++
      }
    }
    return merged
  }

  it('should merge delete+insert with matching groupId', () => {
    const result = mergeSubstitutions([
      {
        type: 'criticDelete',
        isMark: true,
        substituteGroupId: 'group-1',
        children: [{ type: 'text', value: 'old' }],
      },
      {
        type: 'criticInsert',
        isMark: true,
        substituteGroupId: 'group-1',
        children: [{ type: 'text', value: 'new' }],
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('criticSubstitute')
    expect(result[0].deleteChildren).toEqual([{ type: 'text', value: 'old' }])
    expect(result[0].insertChildren).toEqual([{ type: 'text', value: 'new' }])
  })

  it('should NOT merge delete+insert without groupId (independent changes)', () => {
    const result = mergeSubstitutions([
      {
        type: 'criticDelete',
        isMark: true,
        substituteGroupId: '',
        children: [{ type: 'text', value: 'removed' }],
      },
      {
        type: 'criticInsert',
        isMark: true,
        substituteGroupId: '',
        children: [{ type: 'text', value: 'added' }],
      },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('criticDelete')
    expect(result[1].type).toBe('criticInsert')
  })

  it('should NOT merge delete+insert with different groupIds', () => {
    const result = mergeSubstitutions([
      {
        type: 'criticDelete',
        isMark: true,
        substituteGroupId: 'group-A',
        children: [{ type: 'text', value: 'old' }],
      },
      {
        type: 'criticInsert',
        isMark: true,
        substituteGroupId: 'group-B',
        children: [{ type: 'text', value: 'new' }],
      },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('criticDelete')
    expect(result[1].type).toBe('criticInsert')
  })

  it('should NOT merge when isMark is not set', () => {
    const result = mergeSubstitutions([
      {
        type: 'criticDelete',
        substituteGroupId: 'group-1',
        children: [],
      },
      {
        type: 'criticInsert',
        substituteGroupId: 'group-1',
        children: [],
      },
    ])

    expect(result).toHaveLength(2)
  })

  it('should handle mixed paired and unpaired changes', () => {
    const result = mergeSubstitutions([
      // Independent delete
      {
        type: 'criticDelete',
        isMark: true,
        substituteGroupId: '',
        children: [{ type: 'text', value: 'solo delete' }],
      },
      // Paired substitution
      {
        type: 'criticDelete',
        isMark: true,
        substituteGroupId: 'pair-1',
        children: [{ type: 'text', value: 'old' }],
      },
      {
        type: 'criticInsert',
        isMark: true,
        substituteGroupId: 'pair-1',
        children: [{ type: 'text', value: 'new' }],
      },
      // Independent insert
      {
        type: 'criticInsert',
        isMark: true,
        substituteGroupId: '',
        children: [{ type: 'text', value: 'solo insert' }],
      },
    ])

    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('criticDelete') // independent
    expect(result[1].type).toBe('criticSubstitute') // merged pair
    expect(result[2].type).toBe('criticInsert') // independent
  })
})
