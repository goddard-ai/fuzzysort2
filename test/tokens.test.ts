import { describe, expect, it } from 'vitest'

import { match, search } from '../src/index.ts'

describe('tokenized queries', () => {
  it('trims whitespace and removes duplicate tokens after normalization', () => {
    const baseline = match('foo bar', 'foo bar baz')
    const deduped = match('  foo   foo bar  ', 'foo bar baz')

    expect(baseline).not.toBeNull()
    expect(deduped).not.toBeNull()
    expect(deduped?.ranges).toEqual(baseline?.ranges)
    expect(deduped?.score).toBe(baseline?.score)
  })

  it('requires every token to match the same target', () => {
    expect(match('c man', 'CheatManager.h')).not.toBeNull()
    expect(match('c man', 'Cheat.h')).toBeNull()
  })

  it('prefers in-order token placements over out-of-order placements', () => {
    const result = search('c man', [
      'ManagerCheat.h',
      'CheatManager.h',
    ])

    expect(result.items.map(item => item.target)).toEqual([
      'CheatManager.h',
      'ManagerCheat.h',
    ])
  })

  it('uses the coherent full-query match when it outranks token aggregation', () => {
    const result = match('straw berry', 'strawberry')

    expect(result).not.toBeNull()
    expect(result?.ranges).toEqual([{ start: 0, end: 10 }])
  })
})
