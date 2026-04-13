import type { MilkdownPlugin } from '@milkdown/ctx'
import { remarkCtx } from '@milkdown/core'
import { SchemaReady } from '@milkdown/core'

/**
 * Milkdown plugin that wraps the remark processor's stringify method
 * to merge adjacent criticDelete + criticInsert mdast nodes into
 * criticSubstitute — but ONLY when they share a non-empty
 * substituteGroupId, proving they originated from the same substitution.
 *
 * Independent adjacent delete + insert changes (no shared groupId)
 * are left as separate constructs to preserve their distinct semantics.
 */
export const criticSubstituteSerializerPlugin: MilkdownPlugin = (ctx) => {
  return async () => {
    await ctx.wait(SchemaReady)

    const remark = ctx.get(remarkCtx)
    const originalStringify = remark.stringify.bind(remark)

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

  // Merge adjacent criticDelete + criticInsert only when they share a substituteGroupId
  const merged: any[] = []
  let i = 0
  while (i < node.children.length) {
    const current = node.children[i]
    const next = node.children[i + 1]

    if (
      current?.type === 'criticDelete' &&
      next?.type === 'criticInsert' &&
      current.isMark &&
      next.isMark &&
      hasMatchingGroupId(current, next)
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

/**
 * Check if two mdast nodes (serialized from PM marks) share a non-empty
 * substituteGroupId. The groupId is stored as a mark attribute and
 * propagated to the mdast node by Milkdown's serializer.
 */
function hasMatchingGroupId(deleteNode: any, insertNode: any): boolean {
  const deleteGroupId = deleteNode.substituteGroupId
  const insertGroupId = insertNode.substituteGroupId

  // Only merge if both have a non-empty, matching groupId
  if (!deleteGroupId || !insertGroupId) return false
  return deleteGroupId === insertGroupId
}
