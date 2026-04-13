# micromark-extension-critic-markup

Micromark extension that adds tokenization support for all five [CriticMarkup](https://criticmarkup.com/) constructs: insertion (`{++…++}`), deletion (`{--…--}`), substitution (`{~~…~>…~~}`), highlight (`{==…==}`), and comment (`{>>…<<}`).

## Install

```bash
pnpm add micromark-extension-critic-markup
```

## Usage

```typescript
import { micromark } from 'micromark'
import { criticMarkup } from 'micromark-extension-critic-markup'

const html = micromark('Hello {++world++}', {
  extensions: [criticMarkup()],
})
```

Typically used together with [`mdast-util-critic-markup`](../mdast-util-critic-markup) for AST-level integration.

## Monorepo

Part of [milkdown-plugin-critic-markup](https://github.com/Philippe-Laval/milkdown-plugin-critic-markup).

## License

MIT
