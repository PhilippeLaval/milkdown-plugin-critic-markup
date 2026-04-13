import { describe, it, expect } from 'vitest'

/**
 * Tests that the AddComment command logic is side-effect free
 * when dispatch is absent (ProseMirror command probing).
 *
 * We test this at the module level by verifying the contract:
 * the command function, when called without dispatch, must not
 * mutate any external state.
 */
describe('AddComment command safety', () => {
  it('should not create thread state when dispatch is undefined', () => {
    // Simulate the command logic without a full Milkdown editor.
    // The key invariant: thread mutations only happen inside the `if (!dispatch) return true` guard.

    // Extract and verify the pattern from the source code
    const commandSource = `
      return (state, dispatch) => {
        if (!dispatch) return true
        // ... thread creation happens AFTER this guard
      }
    `

    // Read the actual source to verify the guard exists before any side effects
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/commands.ts'),
      'utf-8',
    )

    // Find the AddComment command body
    const addCommentStart = source.indexOf("$command('AddComment'")
    expect(addCommentStart).toBeGreaterThan(-1)

    // Find the end of the AddComment command (next $command or end of file)
    const nextCommand = source.indexOf("$command('", addCommentStart + 1)
    const commandBody = source.slice(addCommentStart, nextCommand > 0 ? nextCommand : undefined)

    // Verify the dispatch guard comes before any thread mutation
    const dispatchGuardPos = commandBody.indexOf('if (!dispatch) return true')
    const threadMutationPos = commandBody.indexOf('ctx.set(criticThreadsSlice')
    const onThreadsChangePos = commandBody.indexOf('onThreadsChange')

    expect(dispatchGuardPos).toBeGreaterThan(-1)
    expect(threadMutationPos).toBeGreaterThan(-1)
    expect(onThreadsChangePos).toBeGreaterThan(-1)

    // The guard must appear BEFORE any thread state mutation
    expect(dispatchGuardPos).toBeLessThan(threadMutationPos)
    expect(dispatchGuardPos).toBeLessThan(onThreadsChangePos)
  })

  it('should dispatch PM transaction before creating thread state', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/commands.ts'),
      'utf-8',
    )

    const addCommentStart = source.indexOf("$command('AddComment'")
    // Find the end of the AddComment command (next $command or end of file)
    const nextCommand = source.indexOf("$command('", addCommentStart + 1)
    const commandBody = source.slice(addCommentStart, nextCommand > 0 ? nextCommand : undefined)

    // dispatch(tr) must come before ctx.set(criticThreadsSlice)
    const dispatchCallPos = commandBody.indexOf('dispatch(tr)')
    const threadMutationPos = commandBody.indexOf('ctx.set(criticThreadsSlice')

    expect(dispatchCallPos).toBeGreaterThan(-1)
    expect(threadMutationPos).toBeGreaterThan(-1)
    expect(dispatchCallPos).toBeLessThan(threadMutationPos)
  })
})
