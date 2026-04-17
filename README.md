# fuzzysort2

## Purpose

`fuzzysort2` is a TypeScript-first fuzzy search library for matching one query against one string, searching arrays of strings, and searching records through one or more named text fields.

## Installation

```sh
pnpm add fuzzysort2
```

## Quick Example

```ts
import { search } from 'fuzzysort2'

const result = search('c man', [
  'CheatManager.h',
  'Manifest.cpp',
  'CheatManager.cpp',
], { limit: 2 })

console.log(result.items.map(item => item.target))
```

## Documentation Map

- Concepts, API selection, invariants, and recommended patterns: [docs/context.md](docs/context.md)
- Runnable usage examples: [examples/basic-search.ts](examples/basic-search.ts), [examples/prepared-targets.ts](examples/prepared-targets.ts), [examples/field-search.ts](examples/field-search.ts), [examples/highlighting.ts](examples/highlighting.ts)
- Exact exported signatures: generated `dist/index.d.mts` after `pnpm build`
- Factual API behavior: public TSDoc in [src/index.ts](src/index.ts)
