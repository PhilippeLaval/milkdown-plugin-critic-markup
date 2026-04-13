import type { Parent, Literal, PhrasingContent } from 'mdast'

export interface CriticDelete extends Parent {
  type: 'criticDelete'
  children: PhrasingContent[]
}

export interface CriticInsert extends Parent {
  type: 'criticInsert'
  children: PhrasingContent[]
}

export interface CriticSubstitute extends Parent {
  type: 'criticSubstitute'
  children: PhrasingContent[]
  deleteChildren: PhrasingContent[]
  insertChildren: PhrasingContent[]
}

export interface CriticHighlight extends Parent {
  type: 'criticHighlight'
  children: PhrasingContent[]
}

export interface CriticComment extends Literal {
  type: 'criticComment'
  value: string
  threadId?: string
}

export type CriticNode =
  | CriticDelete
  | CriticInsert
  | CriticSubstitute
  | CriticHighlight
  | CriticComment

// Module augmentation for mdast
declare module 'mdast' {
  interface PhrasingContentMap {
    criticDelete: CriticDelete
    criticInsert: CriticInsert
    criticSubstitute: CriticSubstitute
    criticHighlight: CriticHighlight
    criticComment: CriticComment
  }
}
