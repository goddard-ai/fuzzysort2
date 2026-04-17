import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  highlight,
  match,
  prepare,
  search,
  searchBy,
  searchFields,
  segments,
} from '../src/index.ts'

describe('package surface', () => {
  it('exports the public runtime entry points', () => {
    expect(typeof prepare).toBe('function')
    expect(typeof match).toBe('function')
    expect(typeof search).toBe('function')
    expect(typeof searchBy).toBe('function')
    expect(typeof searchFields).toBe('function')
    expect(typeof segments).toBe('function')
    expect(typeof highlight).toBe('function')
  })

  it('documents the canonical public APIs in the README', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

    expect(readme).toContain("import { match } from 'fuzzysort2'")
    expect(readme).toContain("import { search } from 'fuzzysort2'")
    expect(readme).toContain("import { searchBy } from 'fuzzysort2'")
    expect(readme).toContain("import { searchFields } from 'fuzzysort2'")
    expect(readme).toContain("import { prepare } from 'fuzzysort2'")
  })
})
