import { describe, expect, it } from 'vitest'

import { match } from '../src/index.ts'

describe('match', () => {
  it('returns an exact normalized match with score 1', () => {
    const result = match('fuzzysort', 'FuzzySort')

    expect(result).not.toBeNull()
    expect(result?.target).toBe('FuzzySort')
    expect(result?.score).toBe(1)
    expect(result?.ranges).toEqual([{ start: 0, end: 9 }])
  })

  it('returns merged half-open ranges for subsequence matches', () => {
    const result = match('cman', 'CheatManager')

    expect(result).not.toBeNull()
    expect(result?.target).toBe('CheatManager')
    expect(result?.ranges).toEqual([
      { start: 0, end: 1 },
      { start: 5, end: 8 },
    ])
    expect(result?.score).toBeGreaterThan(0)
    expect(result?.score).toBeLessThan(1)
  })

  it('returns null when the query does not match in order', () => {
    expect(match('zzx', 'fuzzysort')).toBeNull()
  })

  it('scores an exact match higher than a loose subsequence match', () => {
    const exact = match('fuzzysort', 'FuzzySort')
    const loose = match('fs', 'FuzzySort')

    expect(exact).not.toBeNull()
    expect(loose).not.toBeNull()
    expect(exact!.score).toBeGreaterThan(loose!.score)
  })
})
