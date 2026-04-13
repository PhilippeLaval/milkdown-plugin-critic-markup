import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      'micromark-extension-critic-markup': path.resolve(__dirname, '../packages/micromark-extension-critic-markup/src/index.ts'),
      'mdast-util-critic-markup': path.resolve(__dirname, '../packages/mdast-util-critic-markup/src/index.ts'),
      '@milkdown/plugin-critic-markup': path.resolve(__dirname, '../packages/plugin-critic-markup/src/index.ts'),
    },
  },
  server: {
    port: 5199,
    strictPort: true,
  },
})
