import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'micromark-extension-critic-markup': path.resolve(__dirname, 'packages/micromark-extension-critic-markup/src/index.ts'),
      'mdast-util-critic-markup': path.resolve(__dirname, 'packages/mdast-util-critic-markup/src/index.ts'),
      '@milkdown/plugin-critic-markup': path.resolve(__dirname, 'packages/plugin-critic-markup/src/index.ts'),
      '@milkdown/plugin-critic-markup-react': path.resolve(__dirname, 'packages/plugin-critic-markup-react/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
