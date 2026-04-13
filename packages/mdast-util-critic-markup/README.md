# mdast-util-critic-markup

mdast utility providing `fromMarkdown` and `toMarkdown` extensions for [CriticMarkup](https://criticmarkup.com/), plus a convenience `remarkCriticMarkup` remark plugin that bundles the full parsing/serialization pipeline.

## Install

```bash
pnpm add mdast-util-critic-markup
```

## Usage

```typescript
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import { criticMarkup } from 'micromark-extension-critic-markup'
import { criticMarkupFromMarkdown, criticMarkupToMarkdown } from 'mdast-util-critic-markup'

const tree = fromMarkdown('{++hello++}', {
  extensions: [criticMarkup()],
  mdastExtensions: [criticMarkupFromMarkdown()],
})

const md = toMarkdown(tree, {
  extensions: [criticMarkupToMarkdown()],
})
// => '{++hello++}\n'
```

Or use the bundled remark plugin:

```typescript
import { remarkCriticMarkup } from 'mdast-util-critic-markup'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'

const result = await unified()
  .use(remarkParse)
  .use(remarkCriticMarkup)
  .use(remarkStringify)
  .process('{--removed--}')
```

## Monorepo

Part of [milkdown-plugin-critic-markup](https://github.com/Philippe-Laval/milkdown-plugin-critic-markup).

## License

MIT
