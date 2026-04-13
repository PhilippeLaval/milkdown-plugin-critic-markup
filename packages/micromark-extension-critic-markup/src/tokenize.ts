import type { Effects, State, TokenizeContext, Code } from 'micromark-util-types'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    criticInsert: 'criticInsert'
    criticInsertOpen: 'criticInsertOpen'
    criticInsertData: 'criticInsertData'
    criticInsertClose: 'criticInsertClose'
    criticDelete: 'criticDelete'
    criticDeleteOpen: 'criticDeleteOpen'
    criticDeleteData: 'criticDeleteData'
    criticDeleteClose: 'criticDeleteClose'
    criticSubstitute: 'criticSubstitute'
    criticSubstituteOpen: 'criticSubstituteOpen'
    criticSubstituteOldData: 'criticSubstituteOldData'
    criticSubstituteSeparator: 'criticSubstituteSeparator'
    criticSubstituteNewData: 'criticSubstituteNewData'
    criticSubstituteClose: 'criticSubstituteClose'
    criticHighlight: 'criticHighlight'
    criticHighlightOpen: 'criticHighlightOpen'
    criticHighlightData: 'criticHighlightData'
    criticHighlightClose: 'criticHighlightClose'
    criticComment: 'criticComment'
    criticCommentOpen: 'criticCommentOpen'
    criticCommentData: 'criticCommentData'
    criticCommentClose: 'criticCommentClose'
  }
}

type TokenName = keyof import('micromark-util-types').TokenTypeMap

/**
 * Creates a tokenizer for a simple CriticMarkup construct.
 *
 * The key design: data token is never split by false-positive close attempts.
 * We only exit data and enter close when the FULL close sequence (closeChar + closeChar + `}`)
 * is confirmed. Partial matches continue as part of data.
 */
function createSimpleTokenizer(
  openChar: number,
  closeChar: number,
  parentToken: TokenName,
  openToken: TokenName,
  dataToken: TokenName,
  closeToken: TokenName,
) {
  return function (
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    return start

    function start(code: Code): State | undefined {
      if (code !== 123) return nok(code) // `{`
      effects.enter(parentToken)
      effects.enter(openToken)
      effects.consume(code)
      return openFirst
    }

    function openFirst(code: Code): State | undefined {
      if (code !== openChar) return nok(code)
      effects.consume(code)
      return openSecond
    }

    function openSecond(code: Code): State | undefined {
      if (code !== openChar) return nok(code)
      effects.consume(code)
      effects.exit(openToken)
      effects.enter(dataToken)
      return data
    }

    function data(code: Code): State | undefined {
      if (code === null) return nok(code)
      if (code === closeChar) {
        // Potential close — but don't exit data yet. Just consume.
        effects.consume(code)
        return maybeCloseSecond
      }
      effects.consume(code)
      return data
    }

    function maybeCloseSecond(code: Code): State | undefined {
      if (code === closeChar) {
        // Two close chars in a row — check for `}`
        effects.consume(code)
        return maybeCloseEnd
      }
      // Not a close — the first closeChar was just data
      if (code === null) return nok(code)
      effects.consume(code)
      return data
    }

    function maybeCloseEnd(code: Code): State | undefined {
      if (code === 125) { // `}`
        // Full close confirmed! Now we need to retroactively treat the last 2 chars
        // as part of the close token. But since we already consumed them in data,
        // we can't split. Instead, we exit data (which includes the close chars)
        // and handle this in from-markdown by trimming.
        //
        // Actually, let's restructure: exit data BEFORE the close chars.
        // But we already consumed them... This is the micromark problem.
        //
        // The correct approach: exit data, enter close, consume `}`, exit close.
        // But the close chars are already consumed as data. We need a different approach.
        //
        // Let me use the approach where we exit data right before consuming the first
        // potential close char, and re-enter data if it fails.
        // That's what the original code did, but it split data tokens.
        //
        // Alternative: accept that data includes the close markers, and strip them
        // in from-markdown. This is simpler and avoids the split data issue.
        effects.consume(code) // consume `}`
        effects.exit(dataToken)
        effects.exit(parentToken)
        return ok
      }
      // Two close chars but no `}` — they were just data
      if (code === null) return nok(code)
      effects.consume(code)
      return data
    }
  }
}

// Character codes: 43=`+`, 45=`-`, 126=`~`, 61=`=`, 62=`>`, 60=`<`

export const tokenizeCriticInsert = createSimpleTokenizer(
  43, 43,
  'criticInsert', 'criticInsertOpen', 'criticInsertData', 'criticInsertClose',
)

export const tokenizeCriticDelete = createSimpleTokenizer(
  45, 45,
  'criticDelete', 'criticDeleteOpen', 'criticDeleteData', 'criticDeleteClose',
)

export const tokenizeCriticHighlight = createSimpleTokenizer(
  61, 61,
  'criticHighlight', 'criticHighlightOpen', 'criticHighlightData', 'criticHighlightClose',
)

export const tokenizeCriticComment = createSimpleTokenizer(
  62, 60,
  'criticComment', 'criticCommentOpen', 'criticCommentData', 'criticCommentClose',
)

/**
 * Substitution tokenizer: `{~~old~>new~~}`
 *
 * Similar to the simple tokenizer but with a separator `~>` between old and new data.
 * Data tokens include the close markers; from-markdown strips them.
 */
export function tokenizeCriticSubstitute(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  let foundSeparator = false

  return start

  function start(code: Code): State | undefined {
    if (code !== 123) return nok(code)
    effects.enter('criticSubstitute')
    effects.enter('criticSubstituteOpen')
    effects.consume(code)
    return openFirst
  }

  function openFirst(code: Code): State | undefined {
    if (code !== 126) return nok(code)
    effects.consume(code)
    return openSecond
  }

  function openSecond(code: Code): State | undefined {
    if (code !== 126) return nok(code)
    effects.consume(code)
    effects.exit('criticSubstituteOpen')
    effects.enter('criticSubstituteOldData')
    return oldData
  }

  function oldData(code: Code): State | undefined {
    if (code === null) return nok(code)
    if (code === 126) { // `~`
      effects.consume(code)
      return maybeSeparator
    }
    effects.consume(code)
    return oldData
  }

  function maybeSeparator(code: Code): State | undefined {
    if (code === 62) { // `>`  — confirmed `~>` separator
      effects.exit('criticSubstituteOldData')
      effects.enter('criticSubstituteSeparator')
      // The `~` was already consumed as old data — we need to adjust.
      // Actually the `~` is already consumed. Let's include it in old data
      // and the `>` starts the separator. But that means old data includes `~`.
      // Simpler: consume `>`, exit separator, enter new data.
      // We'll strip the trailing `~` from old data in from-markdown.
      effects.consume(code)
      effects.exit('criticSubstituteSeparator')
      effects.enter('criticSubstituteNewData')
      foundSeparator = true
      return newData
    }
    // Not separator — `~` was just data, but could be start of close `~~}`
    if (code === 126) { // another `~` — could be `~~}`
      effects.consume(code)
      return maybeOldClose
    }
    if (code === null) return nok(code)
    effects.consume(code)
    return oldData
  }

  function maybeOldClose(code: Code): State | undefined {
    if (code === 125) { // `}` — but we haven't found separator yet
      return nok(code) // invalid — no separator
    }
    if (code === null) return nok(code)
    effects.consume(code)
    return oldData
  }

  function newData(code: Code): State | undefined {
    if (code === null) return nok(code)
    if (code === 126) {
      effects.consume(code)
      return maybeCloseSecond
    }
    effects.consume(code)
    return newData
  }

  function maybeCloseSecond(code: Code): State | undefined {
    if (code === 126) {
      effects.consume(code)
      return maybeCloseEnd
    }
    if (code === null) return nok(code)
    effects.consume(code)
    return newData
  }

  function maybeCloseEnd(code: Code): State | undefined {
    if (code === 125) { // `}`
      effects.consume(code)
      effects.exit('criticSubstituteNewData')
      effects.exit('criticSubstitute')
      return ok
    }
    if (code === null) return nok(code)
    effects.consume(code)
    return newData
  }
}
