import { describe, expect, it } from 'vitest'

import { highlight, match, search, segments } from '../src/index.ts'

describe('ranking', () => {
  it('prefers boundary-aligned matches over later non-boundary matches', () => {
    const result = search('cm', [
      'pacman',
      'CheatManager',
    ])

    expect(result.items.map(item => item.target)).toEqual([
      'CheatManager',
      'pacman',
    ])
  })

  it('prefers contiguous matches over equally early non-contiguous matches', () => {
    const result = search('man', [
      'Mergan',
      'Manager',
    ])

    expect(result.items.map(item => item.target)).toEqual([
      'Manager',
      'Mergan',
    ])
  })

  it('prefers earlier matches over otherwise comparable later matches', () => {
    const result = search('sort', [
      'AlphaSort',
      'sortAlpha',
    ])

    expect(result.items.map(item => item.target)).toEqual([
      'sortAlpha',
      'AlphaSort',
    ])
  })
})

describe('highlight helpers', () => {
  it('splits a match into minimal alternating segments', () => {
    const result = match('cman', 'CheatManager')

    expect(result).not.toBeNull()
    expect(segments(result!)).toEqual([
      { text: 'C', matched: true },
      { text: 'heat', matched: false },
      { text: 'Man', matched: true },
      { text: 'ager', matched: false },
    ])
  })

  it('renders highlighted output with default and custom wrappers', () => {
    const result = match('cman', 'CheatManager')

    expect(result).not.toBeNull()
    expect(highlight(result!)).toBe('<mark>C</mark>heat<mark>Man</mark>ager')
    expect(highlight(result!, { open: '<b>', close: '</b>' })).toBe('<b>C</b>heat<b>Man</b>ager')
  })
})
