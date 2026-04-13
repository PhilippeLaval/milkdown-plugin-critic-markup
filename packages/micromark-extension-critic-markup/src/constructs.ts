import type { Construct } from 'micromark-util-types'
import {
  tokenizeCriticDelete,
  tokenizeCriticInsert,
  tokenizeCriticSubstitute,
  tokenizeCriticHighlight,
  tokenizeCriticComment,
} from './tokenize.js'

export const criticDeleteConstruct: Construct = {
  name: 'criticDelete',
  tokenize: tokenizeCriticDelete,
}

export const criticInsertConstruct: Construct = {
  name: 'criticInsert',
  tokenize: tokenizeCriticInsert,
}

export const criticSubstituteConstruct: Construct = {
  name: 'criticSubstitute',
  tokenize: tokenizeCriticSubstitute,
}

export const criticHighlightConstruct: Construct = {
  name: 'criticHighlight',
  tokenize: tokenizeCriticHighlight,
}

export const criticCommentConstruct: Construct = {
  name: 'criticComment',
  tokenize: tokenizeCriticComment,
}
