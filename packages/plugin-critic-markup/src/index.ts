import { $remark } from '@milkdown/utils'
import { remarkCriticMarkup } from 'mdast-util-critic-markup'
import { criticInsertMark, criticDeleteMark, criticHighlightMark, criticSubstituteNode, criticCommentNode } from './schema.js'
import {
  criticMarkupOptionsCtx,
  criticMarkupOptionsSlice,
  criticThreadsCtx,
  criticThreadsSlice,
  criticThreadsConfigCtx,
  criticThreadsConfigSlice,
  criticChangesCtx,
  criticChangesSlice,
  addInsertCommand,
  addDeleteCommand,
  addHighlightCommand,
  addCommentCommand,
  acceptChangeCommand,
  rejectChangeCommand,
  acceptAllChangesCommand,
  rejectAllChangesCommand,
  addReplyCommand,
  resolveThreadCommand,
  editCommentCommand,
  deleteCommentCommand,
} from './commands.js'
import { criticDecorationsPlugin } from './decorations.js'
import { criticLifecyclePlugin } from './lifecycle.js'
import { criticSubstituteSerializerPlugin } from './substitute-serializer.js'

export {
  criticInsertMark,
  criticDeleteMark,
  criticHighlightMark,
  criticSubstituteNode,
  criticCommentNode,
} from './schema.js'

export {
  criticMarkupOptionsSlice as criticMarkupOptions,
  criticThreadsSlice,
  criticThreadsConfigSlice as criticThreadsConfig,
  criticChangesSlice,
  addInsertCommand,
  addDeleteCommand,
  addHighlightCommand,
  addCommentCommand,
  acceptChangeCommand,
  rejectChangeCommand,
  acceptAllChangesCommand,
  rejectAllChangesCommand,
  addReplyCommand,
  resolveThreadCommand,
  editCommentCommand,
  deleteCommentCommand,
} from './commands.js'

export { criticDecorationsPlugin } from './decorations.js'
export { criticLifecyclePlugin } from './lifecycle.js'

export type {
  CriticMarkupOptions,
  CriticChangeEvent,
  CriticChange,
  CriticThread,
  CriticThreadComment,
  CriticThreadsConfig,
} from './types.js'

// Remark plugin: parsing (micromark + mdast-util)
const criticRemarkPlugin = $remark('criticMarkup', () => remarkCriticMarkup)

// Plugin assembly — consumers import this array and pass it to Editor.use()
export const criticMarkupPlugin = [
  // Ctx slices (must be registered first)
  criticMarkupOptionsCtx,
  criticThreadsCtx,
  criticThreadsConfigCtx,
  criticChangesCtx,
  // Remark plugin
  criticRemarkPlugin,
  // Schema
  criticInsertMark,
  criticDeleteMark,
  criticHighlightMark,
  criticSubstituteNode,
  criticCommentNode,
  // Commands
  addInsertCommand,
  addDeleteCommand,
  addHighlightCommand,
  addCommentCommand,
  acceptChangeCommand,
  rejectChangeCommand,
  acceptAllChangesCommand,
  rejectAllChangesCommand,
  addReplyCommand,
  resolveThreadCommand,
  editCommentCommand,
  deleteCommentCommand,
  // Substitution serializer (merges adjacent delete+insert back to {~~old~>new~~})
  criticSubstituteSerializerPlugin,
  // Lifecycle (thread hydration + changes slice population)
  criticLifecyclePlugin,
  // Decorations (floating toolbar)
  criticDecorationsPlugin,
].flat()
