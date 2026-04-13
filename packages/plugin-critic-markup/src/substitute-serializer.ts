import type { MilkdownPlugin } from '@milkdown/ctx'
import { remarkCtx } from '@milkdown/core'
import { SchemaReady } from '@milkdown/core'

/**
 * Milkdown plugin that wraps the remark processor's stringify method
 * to merge adjacent criticDelete + criticInsert mdast nodes into
 * criticSubstitute before stringification.
 *
 * This ensures {~~old~>new~~} round-trips correctly through ProseMirror
 * where substitutions are stored as adjacent delete + insert marks.
 */
export const criticSubstituteSerializerPlugin: MilkdownPlugin = (ctx) => {
  return async () => {
    await ctx.wait(SchemaReady)

    const remark = ctx.get(remarkCtx)
    const originalStringify = remark.stringify.bind(remark)

    // Monkey-patch stringify to merge substitutions before stringification
    ;(remark as any).stringify = (tree: any, ...args: any[]) => {
      mergeSubstitutions(tree)
      return originalStringify(tree, ...args)
    }

    ctx.set(remarkCtx, remark)
  }
}

function mergeSubstitutions(node: any) {
  if (!node || !Array.isArray(node.children)) return

  // Recurse first
  for (const child of node.children) {
    mergeSubstitutions(child)
  }

  // Merge adjacent criticDelete + criticInsert
  const merged: any[] = []
  let i = 0
  while (i < node.children.length) {
    const current = node.children[i]
    const next = node.children[i + 1]

    if (
      current?.type === 'criticDelete' &&
      next?.type === 'criticInsert'
    ) {
      merged.push({
        type: 'criticSubstitute',
        children: [],
        deleteChildren: current.children ?? [],
        insertChildren: next.children ?? [],
      })
      i += 2
    } else {
      merged.push(current)
      i++
    }
  }

  node.children = merged
}
