import type { Literal, PhrasingContent } from 'mdast'

/** Base for critic nodes that contain phrasing children. */
interface CriticParent {
  children: PhrasingContent[]
  position?: { start: { line: number; column: number; offset?: number }; end: { line: number; column: number; offset?: number } } | undefined
  data?: Record<string, unknown> | undefined
}

export interface CriticDelete extends CriticParent {
  type: 'criticDelete'
}

export interface CriticInsert extends CriticParent {
  type: 'criticInsert'
}

export interface CriticSubstitute extends CriticParent {
  type: 'criticSubstitute'
  deleteChildren: PhrasingContent[]
  insertChildren: PhrasingContent[]
}

export interface CriticHighlight extends CriticParent {
  type: 'criticHighlight'
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
