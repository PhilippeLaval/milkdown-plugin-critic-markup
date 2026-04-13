import { $markSchema, $nodeSchema } from '@milkdown/utils'

export const criticInsertMark = $markSchema('criticInsert', () => ({
  attrs: { authorId: { default: '' } },
  inclusive: false,
  parseDOM: [{ tag: 'ins.critic' }],
  toDOM() {
    return ['ins', { class: 'critic critic-insert' }, 0]
  },
  parseMarkdown: {
    match: (node: { type: string }) => node.type === 'criticInsert',
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === 'criticInsert',
    runner: (state: any, mark: any) => {
      state.withMark(mark, 'criticInsert')
    },
  },
}))

export const criticDeleteMark = $markSchema('criticDelete', () => ({
  attrs: { authorId: { default: '' } },
  inclusive: false,
  parseDOM: [{ tag: 'del.critic' }],
  toDOM() {
    return ['del', { class: 'critic critic-delete' }, 0]
  },
  parseMarkdown: {
    match: (node: { type: string }) => node.type === 'criticDelete',
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === 'criticDelete',
    runner: (state: any, mark: any) => {
      state.withMark(mark, 'criticDelete')
    },
  },
}))

export const criticHighlightMark = $markSchema('criticHighlight', () => ({
  attrs: { authorId: { default: '' } },
  inclusive: false,
  parseDOM: [{ tag: 'mark.critic' }],
  toDOM() {
    return ['mark', { class: 'critic critic-highlight' }, 0]
  },
  parseMarkdown: {
    match: (node: { type: string }) => node.type === 'criticHighlight',
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === 'criticHighlight',
    runner: (state: any, mark: any) => {
      state.withMark(mark, 'criticHighlight')
    },
  },
}))

// Substitution is a virtual node: it parses into adjacent criticDelete + criticInsert marks
// in ProseMirror. The serializer detects this adjacency and emits {~~old~>new~~}.
export const criticSubstituteNode = $nodeSchema('criticSubstitute', () => ({
  group: 'inline',
  inline: true,
  content: 'inline*',
  parseDOM: [],
  toDOM() {
    return ['span', { class: 'critic critic-substitute' }, 0] as const
  },
  parseMarkdown: {
    match: (node: { type: string }) => node.type === 'criticSubstitute',
    runner: (state: any, node: any, _nodeType: any) => {
      // Convert substitute into adjacent delete + insert marks
      const deleteMarkType = state.schema.marks.criticDelete
      const insertMarkType = state.schema.marks.criticInsert

      if (deleteMarkType && node.deleteChildren) {
        state.openMark(deleteMarkType)
        state.next(node.deleteChildren)
        state.closeMark(deleteMarkType)
      }
      if (insertMarkType && node.insertChildren) {
        state.openMark(insertMarkType)
        state.next(node.insertChildren)
        state.closeMark(insertMarkType)
      }
    },
  },
  toMarkdown: {
    match: () => false, // never matches — substitution is serialized via mark adjacency
    runner: () => {},
  },
}))

export const criticCommentNode = $nodeSchema('criticComment', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    comment: { default: '' },
    authorId: { default: '' },
    threadId: { default: '' },
    resolved: { default: false },
  },
  parseDOM: [
    {
      tag: 'span.critic-comment',
      getAttrs(dom: HTMLElement) {
        return {
          comment: dom.getAttribute('title') ?? '',
          threadId: dom.dataset.threadId ?? '',
          resolved: dom.dataset.resolved === 'true',
        }
      },
    },
  ],
  toDOM(node) {
    return [
      'span',
      {
        class: `critic critic-comment${node.attrs.resolved ? ' critic-comment--resolved' : ''}`,
        title: node.attrs.comment,
        'data-thread-id': node.attrs.threadId,
        'data-resolved': String(node.attrs.resolved),
      },
      '\u{1F4AC}',
    ]
  },
  parseMarkdown: {
    match: (node: { type: string }) => node.type === 'criticComment',
    runner: (state: any, node: any, nodeType: any) => {
      state.addNode(nodeType, { comment: node.value ?? '' })
    },
  },
  toMarkdown: {
    match: (node: any) => node.type.name === 'criticComment',
    runner: (state: any, node: any) => {
      state.addNode('criticComment', undefined, undefined, {
        value: node.attrs.comment,
      })
    },
  },
}))
