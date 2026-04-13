import type { Options } from 'mdast-util-to-markdown'
import type {
  CriticDelete,
  CriticInsert,
  CriticSubstitute,
  CriticHighlight,
  CriticComment,
} from './types.js'

interface State {
  containerPhrasing: (node: { children: unknown[] }, info: unknown) => string
}

interface Info {
  before: string
  after: string
}

function serializeChildren(node: { children: unknown[] }, state: State, info: Info): string {
  // Use containerPhrasing but with non-space boundary chars to avoid space escaping
  return state.containerPhrasing(node, {
    before: 'a',
    after: 'a',
  })
}

export function criticMarkupToMarkdown(): Options {
  return {
    handlers: {
      criticInsert(node: CriticInsert, _parent: unknown, state: State, info: Info) {
        return `{++${serializeChildren(node, state, info)}++}`
      },
      criticDelete(node: CriticDelete, _parent: unknown, state: State, info: Info) {
        return `{--${serializeChildren(node, state, info)}--}`
      },
      criticHighlight(node: CriticHighlight, _parent: unknown, state: State, info: Info) {
        return `{==${serializeChildren(node, state, info)}==}`
      },
      criticComment(node: CriticComment) {
        if (node.threadId) {
          return `{>>[@critic:${node.threadId}] ${node.value}<<}`
        }
        // Escape: prepend `\` if the body starts with any number of `\` followed
        // by `[@critic:`, so the parser can always strip exactly one layer.
        let body = node.value
        if (/^\\*\[@critic:/.test(body)) {
          body = `\\${body}`
        }
        return `{>>${body}<<}`
      },
      criticSubstitute(node: CriticSubstitute, _parent: unknown, state: State, info: Info) {
        const oldContent = serializeChildren({ children: node.deleteChildren }, state, info)
        const newContent = serializeChildren({ children: node.insertChildren }, state, info)
        return `{~~${oldContent}~>${newContent}~~}`
      },
    } as Record<string, (...args: never[]) => string>,
  }
}
