import type { Root, Parent } from 'mdast'

/**
 * Remark plugin that merges adjacent criticDelete + criticInsert nodes
 * into a single criticSubstitute node during serialization.
 *
 * This restores the {~~old~>new~~} syntax after round-tripping through
 * ProseMirror where substitutions are stored as adjacent marks.
 */
export function remarkCriticSubstituteMerge() {
  return (tree: Root) => {
    visitParents(tree)
  }
}

function visitParents(node: Root | Parent) {
  if (!('children' in node) || !Array.isArray(node.children)) return

  // First recurse into children
  for (const child of node.children) {
    if ('children' in child) {
      visitParents(child as Parent)
    }
  }

  // Then merge adjacent criticDelete + criticInsert pairs
  const merged: typeof node.children = []
  let i = 0
  while (i < node.children.length) {
    const current = node.children[i]
    const next = node.children[i + 1]

    if (
      current &&
      next &&
      (current as { type: string }).type === 'criticDelete' &&
      (next as { type: string }).type === 'criticInsert'
    ) {
      // Merge into criticSubstitute
      merged.push({
        type: 'criticSubstitute' as never,
        children: [],
        deleteChildren: (current as { children: unknown[] }).children,
        insertChildren: (next as { children: unknown[] }).children,
      } as never)
      i += 2
    } else {
      merged.push(current)
      i++
    }
  }

  node.children = merged as typeof node.children
}
