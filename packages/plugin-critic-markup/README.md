# @milkdown/plugin-critic-markup

Milkdown plugin that adds full [CriticMarkup](https://criticmarkup.com/) support to any Milkdown v7+ editor: ProseMirror schema, commands, inline floating toolbar, comment threading, and scoped CSS.

## Install

```bash
pnpm add @milkdown/plugin-critic-markup
```

## Usage

```typescript
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { criticMarkupPlugin, criticMarkupOptions } from '@milkdown/plugin-critic-markup'

Editor.make()
  .config(ctx => {
    ctx.set(rootCtx, document.getElementById('editor'))
    ctx.set(defaultValueCtx, 'Hello {++world++}')
    ctx.set(criticMarkupOptions, {
      authorId: 'user-123',
      enableFloatingToolbar: true,
    })
  })
  .use(commonmark)
  .use(criticMarkupPlugin)
  .create()
```

## Commands

| Command | Description |
|---|---|
| `AddInsert` | Wrap selection as an insertion mark |
| `AddDelete` | Wrap selection as a deletion mark |
| `AddHighlight` | Wrap selection as a highlight mark |
| `AddComment` | Insert a comment node at cursor |
| `AcceptChange` | Accept the critic mark at cursor |
| `RejectChange` | Reject the critic mark at cursor |
| `AcceptAllChanges` | Accept all changes in the document |
| `RejectAllChanges` | Reject all changes in the document |

## Monorepo

Part of [milkdown-plugin-critic-markup](https://github.com/Philippe-Laval/milkdown-plugin-critic-markup).

## License

MIT
