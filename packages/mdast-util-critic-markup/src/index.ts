import { criticMarkup } from 'micromark-extension-critic-markup'
import { criticMarkupFromMarkdown } from './from-markdown.js'
import { criticMarkupToMarkdown } from './to-markdown.js'

export { criticMarkupFromMarkdown } from './from-markdown.js'
export { criticMarkupToMarkdown } from './to-markdown.js'
export { remarkCriticSubstituteMerge } from './substitute-merge.js'
export type {
  CriticDelete,
  CriticInsert,
  CriticSubstitute,
  CriticHighlight,
  CriticComment,
  CriticNode,
} from './types.js'

/**
 * Remark plugin that adds CriticMarkup support.
 * Bundles the micromark extension and both mdast utilities.
 */
export function remarkCriticMarkup() {
  // @ts-expect-error — unified `this` context
  const data = this.data()

  const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = [])
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions || (data.fromMarkdownExtensions = [])
  const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = [])

  micromarkExtensions.push(criticMarkup())
  fromMarkdownExtensions.push(criticMarkupFromMarkdown())
  toMarkdownExtensions.push(criticMarkupToMarkdown())
}
