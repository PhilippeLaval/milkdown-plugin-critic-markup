import type { Effects, State, TokenizeContext, Code } from 'micromark-util-types'
import { markdownLineEnding } from 'micromark-util-character'

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
 * Data tokens never split on false-positive close attempts — only the full
 * close sequence (`closeChar closeChar }`) ends the construct. Line endings
 * inside the construct are emitted as separate `lineEnding` tokens so that
 * micromark's subtokenize can re-process the enclosing text correctly.
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
      if (markdownLineEnding(code)) return lineEnding(code)
      if (code === closeChar) {
        effects.consume(code)
        return maybeCloseSecond
      }
      effects.consume(code)
      return data
    }

    function lineEnding(code: Code): State | undefined {
      effects.exit(dataToken)
      effects.enter('lineEnding')
      effects.consume(code)
      effects.exit('lineEnding')
      effects.enter(dataToken)
      return data
    }

    function maybeCloseSecond(code: Code): State | undefined {
      if (code === closeChar) {
        effects.consume(code)
        return maybeCloseEnd
      }
      if (code === null) return nok(code)
      if (markdownLineEnding(code)) return lineEnding(code)
      effects.consume(code)
      return data
    }

    function maybeCloseEnd(code: Code): State | undefined {
      if (code === 125) { // `}`
        effects.consume(code)
        effects.exit(dataToken)
        effects.exit(parentToken)
        return ok
      }
      if (code === null) return nok(code)
      if (markdownLineEnding(code)) return lineEnding(code)
      effects.consume(code)
      return data
    }
    void closeToken
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
 */
export function tokenizeCriticSubstitute(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
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
    if (markdownLineEnding(code)) return oldLineEnding(code)
    if (code === 126) { // `~`
      effects.consume(code)
      return maybeSeparator
    }
    effects.consume(code)
    return oldData
  }

  function oldLineEnding(code: Code): State | undefined {
    effects.exit('criticSubstituteOldData')
    effects.enter('lineEnding')
    effects.consume(code)
    effects.exit('lineEnding')
    effects.enter('criticSubstituteOldData')
    return oldData
  }

  function maybeSeparator(code: Code): State | undefined {
    if (code === 62) { // `>`
      effects.exit('criticSubstituteOldData')
      effects.enter('criticSubstituteSeparator')
      effects.consume(code)
      effects.exit('criticSubstituteSeparator')
      effects.enter('criticSubstituteNewData')
      return newData
    }
    if (code === 126) {
      effects.consume(code)
      return maybeOldClose
    }
    if (code === null) return nok(code)
    if (markdownLineEnding(code)) return oldLineEnding(code)
    effects.consume(code)
    return oldData
  }

  function maybeOldClose(code: Code): State | undefined {
    if (code === 125) return nok(code) // `~~}` without separator → invalid
    if (code === null) return nok(code)
    if (markdownLineEnding(code)) return oldLineEnding(code)
    effects.consume(code)
    return oldData
  }

  function newData(code: Code): State | undefined {
    if (code === null) return nok(code)
    if (markdownLineEnding(code)) return newLineEnding(code)
    if (code === 126) {
      effects.consume(code)
      return maybeCloseSecond
    }
    effects.consume(code)
    return newData
  }

  function newLineEnding(code: Code): State | undefined {
    effects.exit('criticSubstituteNewData')
    effects.enter('lineEnding')
    effects.consume(code)
    effects.exit('lineEnding')
    effects.enter('criticSubstituteNewData')
    return newData
  }

  function maybeCloseSecond(code: Code): State | undefined {
    if (code === 126) {
      effects.consume(code)
      return maybeCloseEnd
    }
    if (code === null) return nok(code)
    if (markdownLineEnding(code)) return newLineEnding(code)
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
    if (markdownLineEnding(code)) return newLineEnding(code)
    effects.consume(code)
    return newData
  }
}
