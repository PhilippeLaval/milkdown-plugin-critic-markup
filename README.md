# milkdown-plugin-critic-markup

Full [CriticMarkup](https://criticmarkup.com/) support for [Milkdown](https://milkdown.dev/) v7+ editors — parsing, serializing, and an interactive accept/reject/comment UX.

## Packages

| Package | Description |
|---|---|
| [`micromark-extension-critic-markup`](./packages/micromark-extension-critic-markup) | Tokenizer extension for micromark |
| [`mdast-util-critic-markup`](./packages/mdast-util-critic-markup) | AST builder and serializer for mdast, plus a remark plugin |
| [`@milkdown/plugin-critic-markup`](./packages/plugin-critic-markup) | The Milkdown plugin (schema, commands, decorations, threading) |
| [`@milkdown/plugin-critic-markup-react`](./packages/plugin-critic-markup-react) | Optional React sidebar component for threaded comments |

## Supported Syntax

| Type | Syntax | Meaning |
|---|---|---|
| Insertion | `{++inserted text++}` | Content to be added |
| Deletion | `{--deleted text--}` | Content to be removed |
| Substitution | `{~~old text~>new text~~}` | Replace old with new |
| Highlight | `{==highlighted text==}` | Annotate / draw attention |
| Comment | `{>>comment text<<}` | Inline margin comment |
| Comment (threaded) | `{>>[@critic:threadId] comment text<<}` | Comment with thread identity for persistence |

## Quick Start

```bash
pnpm add @milkdown/plugin-critic-markup
```

```typescript
import { Editor } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { criticMarkupPlugin } from '@milkdown/plugin-critic-markup'

Editor.make()
  .config(ctx => {
    ctx.set(rootCtx, document.getElementById('editor'))
  })
  .use(commonmark)
  .use(criticMarkupPlugin)
  .create()
```

## Features

- Parses all 5 CriticMarkup constructs from raw Markdown
- Renders with semantic HTML (`<ins>`, `<del>`, `<mark>`) and scoped CSS
- Floating inline toolbar with Accept / Reject buttons
- Keyboard shortcuts: `Alt+Enter` (accept), `Alt+Backspace` (reject)
- Bulk accept/reject all changes
- Comment threading with out-of-band persistence
- Optional React sidebar for threaded comments

## Development

```bash
pnpm install
pnpm test        # Run unit tests
pnpm dev         # Start the E2E demo app
pnpm build       # Build all packages
```

## Architecture

```
Markdown text  ->  micromark-extension  ->  mdast-util  ->  Milkdown plugin  ->  ProseMirror
                   (tokenizer)              (AST)           (schema/commands)     (rendered editor)
```

Serialization is the reverse path. See [the spec](./milkdown-critic-markup-spec.md) for full details.

## License

MIT
