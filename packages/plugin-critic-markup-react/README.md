# @milkdown/plugin-critic-markup-react

React sidebar component for the Milkdown CriticMarkup plugin. Renders a list of all tracked changes and threaded comments with accept/reject/resolve controls.

## Install

```bash
pnpm add @milkdown/plugin-critic-markup-react
```

## Usage

```tsx
import { CriticSidebar } from '@milkdown/plugin-critic-markup-react'

<CriticSidebar
  editor={editorRef}
  groupBy="type"
  showResolved={false}
  currentAuthorId="user-123"
  onReply={(threadId, body) => { /* persist reply */ }}
  onResolve={(threadId) => { /* mark resolved */ }}
  renderAuthorAvatar={(authorId) => <Avatar id={authorId} />}
/>
```

## Monorepo

Part of [milkdown-plugin-critic-markup](https://github.com/Philippe-Laval/milkdown-plugin-critic-markup).

## License

MIT
