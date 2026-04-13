import type { Extension } from 'micromark-util-types'
import {
  criticDeleteConstruct,
  criticInsertConstruct,
  criticSubstituteConstruct,
  criticHighlightConstruct,
  criticCommentConstruct,
} from './constructs.js'

export { criticDeleteConstruct, criticInsertConstruct, criticSubstituteConstruct, criticHighlightConstruct, criticCommentConstruct }

export function criticMarkup(): Extension {
  return {
    text: {
      // Register all constructs on the `{` code point (123)
      123: [
        criticDeleteConstruct,
        criticInsertConstruct,
        criticSubstituteConstruct,
        criticHighlightConstruct,
        criticCommentConstruct,
      ],
    },
  }
}
