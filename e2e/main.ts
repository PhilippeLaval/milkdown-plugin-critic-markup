import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { criticMarkupPlugin } from '../packages/plugin-critic-markup/src/index.js'
import { getMarkdown } from '@milkdown/utils'

const initialMarkdown = `# CriticMarkup Demo

This is a paragraph with an {++insertion++} and a {--deletion--}.

Here is a {==highlight==} and a {>>comment about this<<}.

Substitution: {~~old text~>new text~~}.

Multiple in one line: {++added++} then {--removed--} then {==noted==}.
`

async function main() {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.getElementById('editor')!)
      ctx.set(defaultValueCtx, initialMarkdown)
    })
    .use(commonmark)
    .use(criticMarkupPlugin)
    .create()

  // Expose editor globally for Chrome automation
  ;(window as any).__editor = editor

  // Serialize button
  document.getElementById('btn-serialize')!.addEventListener('click', () => {
    const md = editor.action(getMarkdown())
    document.getElementById('output')!.textContent = md
    console.log('[E2E] Serialized markdown:', md)
  })

  // Accept all button
  document.getElementById('btn-accept-all')!.addEventListener('click', () => {
    import('@milkdown/core').then(({ commandsCtx }) => {
      editor.ctx.get(commandsCtx).call('AcceptAllChanges')
      console.log('[E2E] Accepted all changes')
    })
  })

  // Reject all button
  document.getElementById('btn-reject-all')!.addEventListener('click', () => {
    import('@milkdown/core').then(({ commandsCtx }) => {
      editor.ctx.get(commandsCtx).call('RejectAllChanges')
      console.log('[E2E] Rejected all changes')
    })
  })

  console.log('[E2E] Editor ready')
}

main().catch(console.error)
