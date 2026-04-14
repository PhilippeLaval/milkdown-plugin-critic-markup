import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { criticMarkupPlugin } from '../packages/plugin-critic-markup/src/index.js'
import { getMarkdown, replaceAll } from '@milkdown/utils'

// Import test files as raw strings
import basicMd from './test-files/basic.md?raw'
import insertionsMd from './test-files/insertions.md?raw'
import deletionsMd from './test-files/deletions.md?raw'
import substitutionsMd from './test-files/substitutions.md?raw'
import highlightsMd from './test-files/highlights.md?raw'
import commentsMd from './test-files/comments.md?raw'
import edgeCasesMd from './test-files/edge-cases.md?raw'
import mixedMd from './test-files/mixed.md?raw'

const testFiles: Record<string, string> = {
  basic: basicMd,
  insertions: insertionsMd,
  deletions: deletionsMd,
  substitutions: substitutionsMd,
  highlights: highlightsMd,
  comments: commentsMd,
  'edge-cases': edgeCasesMd,
  mixed: mixedMd,
}

const initialMarkdown = basicMd

async function main() {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.getElementById('editor')!)
      ctx.set(defaultValueCtx, initialMarkdown)
    })
    .use(commonmark)
    .use(gfm)
    .use(criticMarkupPlugin)
    .create()

  // Expose editor globally for Chrome automation
  ;(window as any).__editor = editor
  ;(window as any).__getMarkdown = () => editor.action(getMarkdown())
  ;(window as any).__loadMarkdown = (md: string) => editor.action(replaceAll(md))
  ;(window as any).__testFiles = testFiles

  const fileNameBadge = document.getElementById('file-name')!
  const outputEl = document.getElementById('output')!
  const outputPanel = document.getElementById('output-panel')!

  // Set initial file name
  fileNameBadge.textContent = 'basic.md'

  // --- Load markdown into editor ---
  function loadMarkdown(md: string, name?: string) {
    editor.action(replaceAll(md))
    if (name) fileNameBadge.textContent = name
    outputEl.textContent = ''
    console.log(`[Playground] Loaded: ${name || 'content'}`)
  }

  // --- File Load ---
  const fileInput = document.getElementById('file-input') as HTMLInputElement
  document.getElementById('btn-load')!.addEventListener('click', () => {
    fileInput.click()
  })
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      loadMarkdown(reader.result as string, file.name)
    }
    reader.readAsText(file)
    fileInput.value = '' // reset so same file can be re-loaded
  })

  // --- File Save ---
  document.getElementById('btn-save')!.addEventListener('click', () => {
    const md = editor.action(getMarkdown())
    const currentName = fileNameBadge.textContent || 'document.md'
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = currentName.endsWith('.md') ? currentName : currentName + '.md'
    a.click()
    URL.revokeObjectURL(url)
    console.log(`[Playground] Saved: ${a.download}`)
  })

  // --- Load test file ---
  document.getElementById('btn-load-test')!.addEventListener('click', () => {
    const select = document.getElementById('test-file-select') as HTMLSelectElement
    const key = select.value
    if (!key || !testFiles[key]) return
    loadMarkdown(testFiles[key], key + '.md')
  })

  // Also load on select change (double-click convenience)
  document.getElementById('test-file-select')!.addEventListener('dblclick', () => {
    const select = document.getElementById('test-file-select') as HTMLSelectElement
    const key = select.value
    if (!key || !testFiles[key]) return
    loadMarkdown(testFiles[key], key + '.md')
  })

  // --- Serialize ---
  document.getElementById('btn-serialize')!.addEventListener('click', () => {
    const md = editor.action(getMarkdown())
    outputEl.textContent = md
    outputPanel.classList.remove('hidden')
    console.log('[Playground] Serialized markdown:\n', md)
  })

  // --- Copy ---
  document.getElementById('btn-copy')!.addEventListener('click', () => {
    const text = outputEl.textContent || ''
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy')!
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = 'Copy' }, 1500)
    })
  })

  // --- Toggle output ---
  document.getElementById('btn-toggle-output')!.addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-output')!
    outputPanel.classList.toggle('hidden')
    btn.textContent = outputPanel.classList.contains('hidden') ? 'Show Output' : 'Hide Output'
  })

  // --- Accept All ---
  document.getElementById('btn-accept-all')!.addEventListener('click', () => {
    import('@milkdown/core').then(({ commandsCtx }) => {
      editor.ctx.get(commandsCtx).call('AcceptAllChanges')
      console.log('[Playground] Accepted all changes')
    })
  })

  // --- Reject All ---
  document.getElementById('btn-reject-all')!.addEventListener('click', () => {
    import('@milkdown/core').then(({ commandsCtx }) => {
      editor.ctx.get(commandsCtx).call('RejectAllChanges')
      console.log('[Playground] Rejected all changes')
    })
  })

  console.log('[Playground] Editor ready')
}

main().catch(console.error)
