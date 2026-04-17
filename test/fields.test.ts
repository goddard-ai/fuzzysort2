import { describe, expect, it } from 'vitest'

import { searchBy, searchFields } from '../src/index.ts'

describe('searchBy', () => {
  it('searches one extracted target per value and skips absent targets', () => {
    const users = [
      { id: 1, name: 'Alec Larson' },
      { id: 2, name: 'Alex Russell' },
      { id: 3, name: null as string | null },
    ]

    let calls = 0
    const result = searchBy('al lar', users, user => {
      calls += 1
      return user.name
    })

    expect(calls).toBe(users.length)
    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.value.id).toBe(1)
    expect(result.items[0]?.target).toBe('Alec Larson')
    expect(result.items[0]?.score).toBeGreaterThan(0)
  })
})

describe('searchFields', () => {
  const files = [
    { id: 1, name: 'CheatManager.h', path: 'src/ui/CheatManager.h' },
    { id: 2, name: 'Cheat', path: 'src/ui/Manager.h' },
    { id: 3, name: 'Cheat', path: 'src/ui/Cheat.h' },
  ]

  const fields = [
    { key: 'name', extract: (file: (typeof files)[number]) => file.name },
    { key: 'path', extract: (file: (typeof files)[number]) => file.path },
  ] as const

  it('matches query tokens across multiple named fields', () => {
    const result = searchFields('c man', files, fields)

    expect(result.total).toBe(2)
    expect(result.items.map(item => item.value.id)).toEqual([1, 2])
    expect(result.items[0]?.fields.map(field => field.key)).toEqual(['name'])
    expect(result.items[1]?.fields.map(field => field.key)).toEqual(['name', 'path'])
  })

  it('throws for empty field lists, empty field keys, and duplicate field keys', () => {
    expect(() => searchFields('c man', files, [])).toThrow(RangeError)
    expect(() => searchFields('c man', files, [
      { key: '', extract: file => file.name },
    ])).toThrow(RangeError)
    expect(() => searchFields('c man', files, [
      { key: 'name', extract: file => file.name },
      { key: 'name', extract: file => file.path },
    ])).toThrow(RangeError)
  })
})
