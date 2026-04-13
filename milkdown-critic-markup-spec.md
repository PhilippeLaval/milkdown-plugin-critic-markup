# Plugin Spec: `@milkdown/plugin-critic-markup`

**Version:** 1.0 (draft)  
**Status:** Ready for development  
**Target:** Milkdown v7+ (ProseMirror-based)  
**Audience:** Plugin developer

---

## 1. Overview

This document specifies a complete, publishable Milkdown plugin that adds full
[CriticMarkup](https://criticmarkup.com/) support — parsing, serializing, and
an interactive accept/reject/comment UX — to any Milkdown-based editor.

The plugin must be self-contained and framework-agnostic at its core, with an
optional React helper package for the floating toolbar UI.

### Deliverables

| Package | Description |
|---|---|
| `micromark-extension-critic-markup` | Tokenizer extension for micromark |
| `mdast-util-critic-markup` | AST builder and stringify for mdast |
| `@milkdown/plugin-critic-markup` | The Milkdown plugin (schema + commands + decorations) |
| `@milkdown/plugin-critic-markup-react` | Optional React toolbar component |

All four packages live in a single monorepo and are published separately to npm.

---

## 2. CriticMarkup Syntax Reference

The plugin must handle all five CriticMarkup constructs:

| Type | Syntax | Meaning |
|---|---|---|
| Deletion | `{--deleted text--}` | Content to be removed |
| Insertion | `{++inserted text++}` | Content to be added |
| Substitution | `{~~old text~>new text~~}` | Replace old with new |
| Highlight | `{==highlighted text==}` | Annotate / draw attention |
| Comment | `{>>comment text<<}` | Inline margin comment |

**Constraints:**
- Constructs may span multiple words but not multiple block elements (no cross-paragraph marks).
- Constructs may be nested inside each other except for same-type nesting (no `{++{++double++}++}`).
- Whitespace inside delimiters is significant and must be preserved.

---

## 3. Architecture

The implementation follows the standard unified/Milkdown plugin stack:

```
Raw Markdown text  (e.g.  "Hello {++world++}")
        │
        ▼ micromark-extension-critic-markup
Tokens  (criticInsertOpen, data, criticInsertClose, …)
        │
        ▼ mdast-util-critic-markup  (fromMarkdown)
mdast node  { type: "criticInsert", children: [{ type: "text", value: "world" }] }
        │
        ▼ Milkdown schema bridge  (the Milkdown plugin)
ProseMirror mark  criticInsert applied to inline text node "world"
        │
        ▼ Decoration layer
Rendered UI  (green underline + floating Accept/Reject buttons)
```

Serialization is the reverse:
```
ProseMirror doc  →  mdast-util-critic-markup (toMarkdown)  →  "{++world++}"
```

---

## 4. Layer 1 — `micromark-extension-critic-markup`

### 4.1 Package structure

```
micromark-extension-critic-markup/
  src/
    index.ts          — exports { criticMarkup }
    constructs.ts     — micromark construct definitions
    tokenize.ts       — tokenizer functions for each type
  test/
    parse.test.ts
  package.json
  README.md
```

### 4.2 Tokens to define

Each construct requires an open token, a marker token, a data token, and a
close token. Use the naming convention `criticXxxOpen`, `criticXxxMarker`,
`criticXxxData`, `criticXxxClose`.

| Construct | Open | Separator (subst. only) | Close |
|---|---|---|---|
| Deletion | `criticDeleteOpen` `{--` | — | `criticDeleteClose` `--}` |
| Insertion | `criticInsertOpen` `{++` | — | `criticInsertClose` `++}` |
| Substitution | `criticSubstituteOpen` `{~~` | `criticSubstituteSeparator` `~>` | `criticSubstituteClose` `~~}` |
| Highlight | `criticHighlightOpen` `{==` | — | `criticHighlightClose` `==}` |
| Comment | `criticCommentOpen` `{>>` | — | `criticCommentClose` `<<}` |

### 4.3 Extension export

```typescript
import type { Extension } from 'micromark-util-types'

export function criticMarkup(): Extension {
  return {
    text: {
      // Register on the `{` code point (123)
      123: [
        criticDeleteConstruct,
        criticInsertConstruct,
        criticSubstituteConstruct,
        criticHighlightConstruct,
        criticCommentConstruct,
      ]
    }
  }
}
```

### 4.4 Test cases (required)

```
Input: "Hello {++world++}"          → tokens: text, criticInsertOpen, data("world"), criticInsertClose
Input: "{--old--}"                  → deletion
Input: "{~~old~>new~~}"             → substitute with separator
Input: "{==note==}"                 → highlight
Input: "{>>aside<<}"                → comment
Input: "{++multi word insertion++}" → data preserves spaces
Input: "no match { ++ broken"       → falls through, no tokens emitted
Input: "{++nested {==hi==}++}"      → highlight inside insert (both tokenized)
```

---

## 5. Layer 2 — `mdast-util-critic-markup`

### 5.1 mdast node types

```typescript
interface CriticDelete extends Parent {
  type: 'criticDelete'
  children: PhrasingContent[]
}

interface CriticInsert extends Parent {
  type: 'criticInsert'
  children: PhrasingContent[]
}

interface CriticSubstitute extends Parent {
  type: 'criticSubstitute'
  deleteChildren: PhrasingContent[]   // content before ~>
  insertChildren: PhrasingContent[]   // content after ~>
}

interface CriticHighlight extends Parent {
  type: 'criticHighlight'
  children: PhrasingContent[]
}

interface CriticComment extends Literal {
  type: 'criticComment'
  value: string    // raw comment text — no child parsing
}
```

Add all five to `@types/mdast` via module augmentation in the package's type
declarations.

### 5.2 fromMarkdown (token → mdast)

Implement the standard `fromMarkdown` extension pattern:

```typescript
export function criticMarkupFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      criticInsert: enterCriticInsert,
      criticDelete: enterCriticDelete,
      // …
    },
    exit: {
      criticInsertClose: exitCriticInsert,
      // …
    }
  }
}
```

### 5.3 toMarkdown (mdast → string)

```typescript
export function criticMarkupToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      criticInsert:    (node, _, state) => `{++${state.containerPhrasing(node, ...)}++}`,
      criticDelete:    (node, _, state) => `{--${state.containerPhrasing(node, ...)}--}`,
      criticHighlight: (node, _, state) => `{==${state.containerPhrasing(node, ...)}==}`,
      criticComment:   (node)           => `{>>${node.value}<<}`,
      criticSubstitute:(node, _, state) => `{~~${state.containerPhrasing({children: node.deleteChildren}, ...)}~>${state.containerPhrasing({children: node.insertChildren}, ...)}~~}`,
    }
  }
}
```

### 5.4 Unified preset

Export a convenience preset that bundles both:

```typescript
export function remarkCriticMarkup(): Plugin {
  return function (this: Processor) {
    this.data('micromarkExtensions', [criticMarkup()])
    this.data('fromMarkdownExtensions', [criticMarkupFromMarkdown()])
    this.data('toMarkdownExtensions', [criticMarkupToMarkdown()])
  }
}
```

---

## 6. Layer 3 — `@milkdown/plugin-critic-markup`

### 6.1 ProseMirror schema

Define four **marks** and handle substitution via a pair of marks with a shared
group ID attribute.

```typescript
// marks added to the Milkdown schema
const criticInsertMark = $markSchema('criticInsert', () => ({
  attrs: { authorId: { default: '' } },
  inclusive: false,
  parseDOM: [{ tag: 'ins.critic' }],
  toDOM: () => ['ins', { class: 'critic critic-insert' }, 0],
}))

const criticDeleteMark = $markSchema('criticDelete', () => ({
  attrs: { authorId: { default: '' } },
  inclusive: false,
  parseDOM: [{ tag: 'del.critic' }],
  toDOM: () => ['del', { class: 'critic critic-delete' }, 0],
}))

const criticHighlightMark = $markSchema('criticHighlight', () => ({
  attrs: { authorId: { default: '' } },
  inclusive: false,
  parseDOM: [{ tag: 'mark.critic' }],
  toDOM: () => ['mark', { class: 'critic critic-highlight' }, 0],
}))

// Comment is a zero-width inline node (atom), not a mark,
// because its content (the comment text) is not part of the
// document text and should not be editable inline.
const criticCommentNode = $nodeSchema('criticComment', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    comment: { default: '' },
    authorId: { default: '' },
    resolved: { default: false },
  },
  parseDOM: [{ tag: 'span.critic-comment', getAttrs: dom => ({ comment: dom.title }) }],
  toDOM: node => ['span', { class: 'critic critic-comment', title: node.attrs.comment }, '💬'],
}))
```

**Substitution** is represented as a `criticDelete` mark on the old text
followed immediately by a `criticInsert` mark on the new text, both carrying
the same `substituteGroupId` (a unique ID generated per substitution pair).
The serializer detects this adjacency pattern via matching group IDs and emits
`{~~old~>new~~}`.

### 6.2 Milkdown ↔ mdast bridge

Register node/mark mappings so the Milkdown serialization bridge handles
round-tripping. Use `$remarkPlugin` to load `remarkCriticMarkup`, and
`$nodeAttr` / `$markAttr` for the attribute wiring.

```typescript
// remark plugin registration
const criticRemarkPlugin = $remarkPlugin(() => remarkCriticMarkup)

// mark input rules (parse mdast → PM)
const criticInsertInputRule = $inputRule(() =>
  markInputRule(/\{\+\+(.+?)\+\+\}/, criticInsertMark.type())
)
```

### 6.3 Commands

Export all commands via `$command` so they are accessible from userland and
from the Milkdown command manager.

```typescript
// Wrap the current selection as an insertion mark
export const addInsertCommand = $command('AddInsert', ctx => () =>
  toggleMark(criticInsertMark.type(ctx))
)

// Wrap the current selection as a deletion mark
export const addDeleteCommand = $command('AddDelete', ctx => () =>
  toggleMark(criticDeleteMark.type(ctx))
)

// Wrap selection as highlight
export const addHighlightCommand = $command('AddHighlight', ctx => () =>
  toggleMark(criticHighlightMark.type(ctx))
)

// Insert a comment node at the cursor / anchor of selection
export const addCommentCommand = $command('AddComment', ctx =>
  (commentText: string) => (state, dispatch) => {
    const node = criticCommentNode.type(ctx).create({ comment: commentText })
    dispatch?.(state.tr.replaceSelectionWith(node))
    return true
  }
)

// Accept the critic mark(s) touching position pos
// - criticInsert  → remove the mark (keep the text)
// - criticDelete  → remove the text and the mark
// - criticHighlight → remove the mark (keep the text)
// - criticComment → remove the node
export const acceptChangeCommand = $command('AcceptChange', ctx =>
  (pos?: number) => (state, dispatch) => {
    // Implementation: find marks/nodes at pos (or all if pos undefined)
    // and apply the accept logic per type
    ...
  }
)

// Reject the critic mark(s) touching position pos
// - criticInsert  → remove the text and the mark
// - criticDelete  → remove the mark (keep the text)
// - criticHighlight → remove the mark (keep the text)
// - criticComment → remove the node
export const rejectChangeCommand = $command('RejectChange', ctx =>
  (pos?: number) => (state, dispatch) => { ... }
)

export const acceptAllChangesCommand = $command('AcceptAllChanges', ctx =>
  () => (state, dispatch) => { ... }
)

export const rejectAllChangesCommand = $command('RejectAllChanges', ctx =>
  () => (state, dispatch) => { ... }
)
```

### 6.4 Plugin options

```typescript
export interface CriticMarkupOptions {
  /**
   * Author ID attached to all new marks created in this session.
   * Used for multi-author scenarios. Default: ''.
   */
  authorId: string

  /**
   * Whether to render floating accept/reject buttons when the cursor
   * is inside a critic mark. Default: true.
   */
  enableFloatingToolbar: boolean

  /**
   * Whether to show a sidebar panel listing all changes and comments.
   * Default: false.
   */
  enableSidebar: boolean

  /**
   * Callback fired after a change is accepted or rejected.
   */
  onChange?: (event: CriticChangeEvent) => void
}

export interface CriticChangeEvent {
  type: 'accept' | 'reject'
  markType: 'insert' | 'delete' | 'highlight' | 'comment' | 'substitute'
  from: number
  to: number
  text: string
}
```

### 6.5 Plugin assembly

```typescript
export const criticMarkupPlugin = [
  // Ctx slices (must be registered first)
  criticMarkupOptionsCtx,
  criticThreadsCtx,
  criticThreadsConfigCtx,
  criticChangesCtx,
  // Remark plugin
  criticRemarkPlugin,
  // Schema
  criticInsertMark,
  criticDeleteMark,
  criticHighlightMark,
  criticSubstituteNode,
  criticCommentNode,
  // Commands
  addInsertCommand,
  addDeleteCommand,
  addHighlightCommand,
  addSubstituteCommand,
  addCommentCommand,
  acceptChangeCommand,
  rejectChangeCommand,
  acceptAllChangesCommand,
  rejectAllChangesCommand,
  addReplyCommand,
  resolveThreadCommand,
  editCommentCommand,
  deleteCommentCommand,
  // Substitution serializer (merges adjacent delete+insert back to {~~old~>new~~})
  criticSubstituteSerializerPlugin,
  // Lifecycle (thread hydration + changes slice population)
  criticLifecyclePlugin,
  // Decorations (floating toolbar)         see §7
  criticDecorationsPlugin,
].flat()
```

Consumer usage:

```typescript
import { Editor } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { criticMarkupPlugin } from '@milkdown/plugin-critic-markup'

Editor.make()
  .config(ctx => {
    ctx.set(criticMarkupOptions.key, {
      authorId: 'user-123',
      enableFloatingToolbar: true,
    })
  })
  .use(commonmark)
  .use(criticMarkupPlugin)
  .create()
```

---

## 7. UX — Decorations and Floating Toolbar

### 7.1 Visual styles (default CSS)

The plugin ships a default stylesheet (`critic-markup.css`). Consumers can
override any class.

```css
/* Insertion — green underline */
ins.critic {
  text-decoration: underline;
  text-decoration-color: #16a34a;
  background-color: #dcfce7;
  color: inherit;
}

/* Deletion — red strikethrough */
del.critic {
  text-decoration: line-through;
  text-decoration-color: #dc2626;
  background-color: #fee2e2;
  color: #6b7280;
}

/* Highlight — amber background */
mark.critic {
  background-color: #fef08a;
  color: inherit;
}

/* Comment anchor — amber dotted underline with icon */
span.critic-comment {
  border-bottom: 2px dotted #d97706;
  cursor: pointer;
  user-select: none;
}

/* Active state (cursor inside mark) */
.critic.critic-active {
  outline: 2px solid currentColor;
  outline-offset: 1px;
  border-radius: 2px;
}
```

### 7.2 Floating toolbar (Decoration widget)

A `DecorationWidget` is injected at the end of any critic mark that contains the
cursor. It renders a small inline toolbar.

**Toolbar anatomy:**

```
┌──────────────────────────────────┐
│  ✓ Accept    ✗ Reject    👤 ...  │
└──────────────────────────────────┘
```

- **Accept** (✓, green): fires `acceptChangeCommand` at the current mark's position.
- **Reject** (✗, red): fires `rejectChangeCommand` at the current mark's position.
- **Author chip** (if `authorId` is set): shows the author name or avatar initial.
- For `criticComment` nodes: toolbar shows only **Resolve** (marks `resolved: true`)
  and **Delete** (removes the node entirely). Hovering also shows the comment
  text in a tooltip.

  **Positioning rules:**
- The toolbar appears inline, immediately after the closing character of the
  marked span (not floating above, to avoid z-index clashes).
- On small viewports (< 480 px), it shifts to a fixed bottom bar.
- There is at most one toolbar visible at a time.

**Keyboard access:**
- When the cursor is inside a critic mark, `Alt+Enter` fires Accept,
  `Alt+Backspace` fires Reject.
- Tab moves between marks when focus is in the toolbar.

### 7.3 Decoration plugin

```typescript
const criticDecorationsPlugin = $prose(ctx => {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = []
        const { doc, selection } = state

        // Walk all marks and inline nodes in the document
        doc.descendants((node, pos) => {
          // Highlight active mark (cursor inside it)
          node.marks.forEach(mark => {
            if (!isCriticMark(mark)) return
            const isActive = selection.from >= pos && selection.to <= pos + node.nodeSize
            if (isActive) {
              decorations.push(
                Decoration.inline(pos, pos + node.nodeSize, { class: 'critic-active' }),
                Decoration.widget(pos + node.nodeSize, renderToolbarWidget(ctx, mark, pos), { side: 1 })
              )
            }
          })

          // Critic comment nodes
          if (node.type === criticCommentNode.type(ctx)) {
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: node.attrs.resolved ? 'critic-comment critic-comment--resolved' : 'critic-comment'
              })
            )
          }
        })

        return DecorationSet.create(doc, decorations)
      }
    }
  })
})
```

### 7.4 Sidebar panel (optional)

When `enableSidebar: true`, the plugin exposes a `CriticChangeList` data
structure via a Milkdown ctx slice, which the host app can subscribe to and
render in its own sidebar:

```typescript
export interface CriticChange {
  id: string           // stable across transactions (based on mark position + content hash)
  type: 'insert' | 'delete' | 'highlight' | 'comment' | 'substitute'
  text: string         // the marked text
  comment?: string     // for criticComment nodes
  authorId: string
  resolved: boolean    // for comments
  from: number
  to: number
}

// Access from host app:
const changes = editor.ctx.get(criticChangesSlice)
```

The sidebar is **not** rendered by the plugin itself — it only provides the
data. The React helper package (`@milkdown/plugin-critic-markup-react`) ships
a `<CriticSidebar>` component that consumes this slice.

### 7.5 React helper component

```tsx
// @milkdown/plugin-critic-markup-react
import { CriticSidebar } from '@milkdown/plugin-critic-markup-react'

// Renders a list of all tracked changes, grouped by type,
// each with Accept / Reject / Resolve buttons.
<CriticSidebar
  editor={editorRef}
  groupBy="type"          // 'type' | 'author' | 'none'
  showResolved={false}
/>
```

The component subscribes to the `criticChangesSlice` and re-renders on every
editor transaction that changes the set of critic marks.

---

## 8. Serialization Edge Cases

The developer must handle the following correctly:

| Case | Expected behaviour |
|---|---|
| Substitution round-trip | `{~~a~>b~~}` → PM: `criticDelete("a") + criticInsert("b")` adjacent → back to `{~~a~>b~~}` |
| Nested marks | `{++**bold insert**++}` → both `criticInsert` and `strong` marks on the same text range |
| Accept insert | Remove `criticInsert` mark, keep text |
| Reject insert | Remove text + mark |
| Accept delete | Remove text + mark |
| Reject delete | Remove `criticDelete` mark, keep text |
| Accept substitute | Remove delete text + both marks; keep insert text without mark |
| Reject substitute | Remove insert text + both marks; keep delete text without mark |
| Empty document | Plugin loads without error |
| Mark at start/end of paragraph | No off-by-one in decoration positions |
| Comment with special characters | `{>> <b>xss</b> <<}` — comment value stored as plain text, never rendered as HTML |

---

## 9. Package & Publishing Requirements

### 9.1 monorepo layout

```
critic-markup-milkdown/
  packages/
    micromark-extension-critic-markup/
    mdast-util-critic-markup/
    plugin-critic-markup/
    plugin-critic-markup-react/
  pnpm-workspace.yaml
  turbo.json (or nx.json)
  README.md
```

### 9.2 Each package must have

- `package.json` with `"exports"`, `"types"`, `"main"`, `"module"` fields
- `tsconfig.json` targeting ES2020, `moduleResolution: "bundler"`
- Build via `tsup` (outputs `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`)
- Peer dependencies correctly declared (not bundled):

```json
// @milkdown/plugin-critic-markup
"peerDependencies": {
  "@milkdown/core": ">=7.0.0",
  "@milkdown/ctx": ">=7.0.0",
  "@milkdown/preset-commonmark": ">=7.0.0",
  "prosemirror-model": ">=1.19.0",
  "prosemirror-state": ">=1.4.0",
  "prosemirror-view": ">=1.31.0"
}
```

### 9.3 Testing

- Unit tests: Vitest
- Integration tests: spin up a headless Milkdown editor with `@testing-library/dom`
- Coverage target: 80 % line coverage on the micromark and mdast-util layers
- All 5 CriticMarkup constructs must have round-trip tests (parse → serialize → identical output)

### 9.4 README requirements (each package)

Each package README must include:
1. What it does (one paragraph)
2. Install command
3. Usage code snippet
4. Link to the monorepo for the full example

### 9.5 Changelog

Follow [Keep a Changelog](https://keepachangelog.com/) format. Use
`changesets` (via `@changesets/cli`) for coordinated version bumps across the
monorepo.

---

## 10. Acceptance Criteria

### Functional
- [ ] All 5 CriticMarkup constructs parse from raw Markdown correctly
- [ ] All 5 constructs serialize back to identical CriticMarkup syntax
- [ ] Nested constructs work (e.g. bold inside an insertion)
- [ ] Accept/Reject commands work correctly for all mark types
- [ ] Substitution round-trips correctly through the PM adjacency representation
- [ ] `addCommentCommand` inserts a `criticComment` node at cursor

### UX
- [ ] Floating toolbar appears when cursor enters a critic mark
- [ ] Toolbar is keyboard-accessible (Alt+Enter / Alt+Backspace)
- [ ] Default CSS is scoped (no global style leakage)
- [ ] Comment tooltip shows comment text on hover

### Code quality
- [ ] TypeScript strict mode with zero `any` in public API surface
- [ ] ESLint passes with no warnings
- [ ] All unit tests pass
- [ ] Round-trip test coverage ≥ 80 %

### Publishing
- [ ] All four packages published to npm under correct scope
- [ ] Peer dependencies correctly declared
- [ ] `exports` map works for both CJS and ESM consumers
- [ ] README on each package is complete

---

## 11. Reference Material

- [CriticMarkup spec](https://criticmarkup.com/spec.php)
- [micromark authoring guide](https://github.com/micromark/micromark#creating-a-micromark-extension)
- [mdast-util-from-markdown API](https://github.com/syntax-tree/mdast-util-from-markdown)
- [ProseMirror guide — decorations](https://prosemirror.net/docs/guide/#view.decorations)
- [Milkdown plugin authoring](https://milkdown.dev/docs/plugin/plugins-101)
- [Existing reference: `remark-critic-markup`](https://github.com/trongthanh/remark-critic-markup) *(minimal, no round-trip — use as syntax reference only, not as a base)*

---

## 12. Out of Scope (v1)

- Block-level CriticMarkup (cross-paragraph deletions)
- Real-time collaborative tracking (Yjs integration — separate plugin)
- Comment threading / replies
- Author avatars / presence indicators
- Diff view mode (side-by-side before/after)
- Export to Word tracked changes (OOXML)

These are reasonable v2 candidates once the core plugin is stable.

---

## 13. Addendum — Comment Threading & Replies

> Added after initial spec. This section extends §6 (schema), §7 (UX), and §9 (publishing).
> Threading is **in scope for v1** given CoWrite's multi-agent review use case.

### 13.1 Design decision: where threads live

CriticMarkup syntax has no concept of thread IDs or replies. The plugin
extends the comment syntax with a lightweight `[@critic:threadId]` prefix to
persist thread identity in the Markdown itself:

- The `criticComment` ProseMirror node gains a `threadId` attribute (UUID v4).
- When a `threadId` is present, the Markdown serializes as
  `{>>[@critic:threadId] comment text<<}`. Without a `threadId`, it serializes
  as plain `{>>comment text<<}`.
- The `[@critic:]` prefix is parsed back on load to restore the `threadId`,
  so thread identity survives Markdown round-trips without external state.
- All thread data beyond identity (replies, authors, timestamps, resolution)
  lives in `criticThreadsSlice`, a Milkdown ctx slice keyed by `threadId`.
- The host app owns persistence of thread data: on document save, it serializes
  both the Markdown and the threads slice to its backend (e.g. DynamoDB). On
  load, it rehydrates the slice before the editor mounts.

  The Markdown file remains valid CriticMarkup — the `[@critic:]` prefix is
  simply treated as part of the comment text by parsers that don't understand it.
  If the threads store is unavailable, the editor degrades gracefully — comments
  still render, replies are simply absent.

### 13.2 Data model

```typescript
export interface CriticThread {
  threadId: string           // UUID v4, matches criticComment node attr
  anchorText: string         // the commented-on text (snapshot at creation time)
  resolved: boolean
  resolvedBy?: string        // authorId who resolved
  resolvedAt?: number        // unix ms
  comments: CriticThreadComment[]
}

export interface CriticThreadComment {
  commentId: string          // UUID v4
  threadId: string
  parentCommentId?: string   // null for root comment; set for nested replies
  authorId: string
  authorDisplayName: string
  body: string               // plain text or lightweight markdown (no HTML)
  createdAt: number          // unix ms
  editedAt?: number
  reactions?: Record<string, string[]>  // emoji → authorId[]
}
```

The root comment (the first entry in `comments`, where `parentCommentId` is
undefined) corresponds to the text stored in the CriticMarkup `{>>...<<}` syntax.
When the document is first parsed, the plugin creates the root `CriticThreadComment`
from the inline comment text and generates a new `threadId` if none exists.

### 13.3 Schema update — criticComment node

Add `threadId` to the node's attrs:

```typescript
const criticCommentNode = $nodeSchema('criticComment', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    comment: { default: '' },      // root comment text (mirrors Markdown)
    authorId: { default: '' },
    threadId: { default: '' },     // UUID — links to criticThreadsSlice entry
    resolved: { default: false },
  },
  // ...
}))
```

On parse from Markdown (`{>>comment text<<}`), if no threadId is found in the
threads slice for this anchor position, the plugin generates one and creates a
new `CriticThread` with a single root `CriticThreadComment` from the comment text.

### 13.4 Threads ctx slice

```typescript
// The slice holds the full thread store for this document
export const criticThreadsSlice = createSlice<Map<string, CriticThread>>(
  new Map(),
  'criticThreads'
)

// Config slice for the persistence hooks
export interface CriticThreadsConfig {
  /**
   * Called when any thread is created, updated, or resolved.
   * The host app persists this to its backend.
   */
  onThreadsChange?: (threads: Map<string, CriticThread>) => void

  /**
   * Initial threads to hydrate on editor mount.
   * Pass the threads you loaded from your backend.
   */
  initialThreads?: Map<string, CriticThread>
}

export const criticThreadsConfig = createSlice<CriticThreadsConfig>(
  {},
  'criticThreadsConfig'
)
```

Host app usage:

```typescript
Editor.make()
  .config(ctx => {
    ctx.set(criticMarkupOptions.key, { authorId: 'user-123' })
    ctx.set(criticThreadsConfig.key, {
      initialThreads: await loadThreadsFromBackend(documentId),
      onThreadsChange: threads => saveThreadsToBackend(documentId, threads),
    })
  })
  .use(commonmark)
  .use(criticMarkupPlugin)
  .create()
```

### 13.5 Threading commands

```typescript
// Add a reply to an existing thread
export const addReplyCommand = $command('AddReply', ctx =>
  (payload: { threadId: string; body: string; parentCommentId?: string }) =>
  (state, dispatch) => {
    const threads = ctx.get(criticThreadsSlice)
    const thread = threads.get(payload.threadId)
    if (!thread) return false

    const reply: CriticThreadComment = {
      commentId: uuid(),
      threadId: payload.threadId,
      parentCommentId: payload.parentCommentId,
      authorId: ctx.get(criticMarkupOptions.key).authorId,
      authorDisplayName: '…',   // host app resolves display name
      body: payload.body,
      createdAt: Date.now(),
    }

    const updated = new Map(threads)
    updated.set(payload.threadId, {
      ...thread,
      comments: [...thread.comments, reply],
    })
    ctx.set(criticThreadsSlice, updated)
    ctx.get(criticThreadsConfig.key).onThreadsChange?.(updated)
    return true
  }
)

// Resolve / unresolve a thread
export const resolveThreadCommand = $command('ResolveThread', ctx =>
  (payload: { threadId: string; resolved: boolean }) =>
  (state, dispatch) => {
    // Update slice + call onThreadsChange
    // Also update the criticComment node's resolved attr via a PM transaction
    ...
  }
)

// Edit a comment body (own comments only)
export const editCommentCommand = $command('EditComment', ctx =>
  (payload: { threadId: string; commentId: string; body: string }) =>
  () => { ... }
)

// Delete a comment (own comments only; root comment deletion removes the node)
export const deleteCommentCommand = $command('DeleteComment', ctx =>
  (payload: { threadId: string; commentId: string }) =>
  (state, dispatch) => { ... }
)
```

### 13.6 UX — thread panel

Threading UX lives primarily in the sidebar (§7.4). The floating inline toolbar
(§7.2) only shows a **thread summary** — clicking it opens the full thread in
the sidebar.

**Inline comment node appearance:**

```
                      ╔══ Sidebar panel ══════════════════════════════╗
                      ║  💬  "We should revisit …"              ●  ╳ ║
  The market grew     ║  ┌─────────────────────────────────────────┐  ║
  {>>We should        ║  │ 👤 Philippe  · 2h ago                   │  ║
   revisit this<<}    ║  │ We should revisit this assumption.      │  ║
  assumption last     ║  └─────────────────────────────────────────┘  ║
  year.               ║    ↳ 👤 Analyst  · 1h ago                     ║
         ↑            ║      Agreed — updated in v3 of the model.     ║
    dotted amber      ║    ↳ 👤 Philippe  · 30m ago                   ║
    underline         ║      Great, let's resolve.         [Resolve]  ║
                      ║  ─────────────────────────────────────────    ║
                      ║  [ Reply… ]                                   ║
                      ╚═══════════════════════════════════════════════╝
```

**Sidebar thread panel behaviour:**
- Threads are listed in document order (top to bottom).
- Clicking a thread in the sidebar scrolls the editor to the anchor and
  applies a `critic-active` decoration.
- Clicking a comment anchor in the editor scrolls the sidebar to the thread.
- Resolved threads are hidden by default; a toggle shows them greyed out.
- The reply input is a plain `<textarea>` with `Cmd+Enter` to submit.
- Replies are flat by default (2 levels max: root + replies). Deep nesting is
  not supported in v1.

  **Floating toolbar update (§7.2 extension):**

  When the cursor is inside a `criticComment` node, the toolbar shows:
- Thread summary chip: `💬 2 replies` (or `💬 No replies yet`)
- **Open thread** button: focuses the sidebar on this thread
- **Resolve** button: fires `resolveThreadCommand`

No inline reply input — replies always happen in the sidebar to keep the
editor surface uncluttered.

### 13.7 React helper update — `<CriticSidebar>`

The React sidebar component is extended:

```tsx
<CriticSidebar
  editor={editorRef}
  groupBy="type"
  showResolved={false}
  currentAuthorId="user-123"
  onReply={(threadId, body, parentCommentId) => { ... }}
  onResolve={(threadId) => { ... }}
  onDelete={(threadId, commentId) => { ... }}
  renderAuthorAvatar={(authorId) => <Avatar id={authorId} />}  // optional
/>
```

The `renderAuthorAvatar` prop allows the host app to inject its own user
resolution logic without the plugin having any knowledge of the auth system.

### 13.8 Persistence contract

The host app must persist and rehydrate two things:

| Artefact | Format | Owner |
|---|---|---|
| Document body | Markdown string (with `{>>…<<}` anchors) | Plugin serializes; host stores |
| Thread store | `Map<string, CriticThread>` serialized as JSON array | Host stores and rehydrates via `initialThreads` |

The `threadId` in the `criticComment` PM node is the join key between these two
artefacts. If a thread store entry has no matching `criticComment` in the
document (e.g. the anchor was deleted), the thread is considered orphaned and
can be shown in a separate "Orphaned comments" section in the sidebar.

### 13.9 Additional acceptance criteria (threading)

- [ ] Root comment text from `{>>…<<}` becomes the first entry in the thread
- [ ] Replies persist via `onThreadsChange` callback
- [ ] `initialThreads` correctly rehydrates threads on editor mount
- [ ] Sidebar scrolls editor to anchor on thread click, and vice versa
- [ ] Resolved threads hidden by default, togglable
- [ ] Flat reply model (2 levels) enforced — no infinite nesting
- [ ] Orphaned threads (anchor deleted from doc) shown separately in sidebar
- [ ] `renderAuthorAvatar` prop works with a custom component
- [ ] `Cmd+Enter` submits reply in sidebar textarea
