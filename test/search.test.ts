import { describe, expect, it } from 'vitest'

import { prepare, search } from '../src/index.ts'

describe('prepare', () => {
  it('returns a reusable prepared target for repeated searches', () => {
    const prepared = prepare('FuzzySort')

    expect(prepared.target).toBe('FuzzySort')

    const loose = search('fs', [prepared])
    const exact = search('fuzzysort', [prepared])

    expect(loose.total).toBe(1)
    expect(loose.items).toHaveLength(1)
    expect(loose.items[0]?.target).toBe('FuzzySort')

    expect(exact.total).toBe(1)
    expect(exact.items).toHaveLength(1)
    expect(exact.items[0]?.score).toBe(1)
    expect(prepared.target).toBe('FuzzySort')
  })
})

describe('search', () => {
  it('returns ranked items and total before limit truncation', () => {
    const result = search('fuzzysort', [
      'prefix-fuzzysort',
      'fuzzysort.cpp',
      'FuzzySort',
    ], { limit: 2 })

    expect(result.total).toBe(3)
    expect(result.items.map(item => item.target)).toEqual([
      'FuzzySort',
      'fuzzysort.cpp',
    ])
  })

  it('applies threshold after scoring', () => {
    const result = search('fuzzysort', [
      'FuzzySort',
      'fuzzysort.cpp',
      'prefix-fuzzysort',
    ], { threshold: 1 })

    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.target).toBe('FuzzySort')
    expect(result.items[0]?.score).toBe(1)
  })

  it('supports limit 0 while preserving the pre-limit total', () => {
    const result = search('fuzzysort', [
      'FuzzySort',
      'fuzzysort.cpp',
      'prefix-fuzzysort',
    ], { limit: 0 })

    expect(result.total).toBe(3)
    expect(result.items).toEqual([])
  })
})
