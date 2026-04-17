# fuzzysort2

```sh
pnpm add fuzzysort2
```

`fuzzysort2` is a TypeScript-first fuzzy search library for matching one string, searching arrays of strings, and searching records through one or more named text fields.

## `match`

```ts
import { match } from 'fuzzysort2'

const result = match('cman', 'CheatManager')
```

`match(query, target)` returns `null` when the query does not match. On success it returns:

- `target`: the original target string
- `score`: a normalized score in `(0, 1]`
- `ranges`: merged half-open match ranges on the original target string

## `search`

```ts
import { search } from 'fuzzysort2'

const result = search('fuzzysort', [
  'FuzzySort',
  'fuzzysort.cpp',
  'prefix-fuzzysort',
], { limit: 2 })
```

`search(query, targets, options)` returns:

- `items`: the ranked matches
- `total`: the number of matches after threshold filtering and before limit truncation

## `prepare`

```ts
import { prepare } from 'fuzzysort2'

const prepared = prepare('CheatManager.h')
```

Prepared targets are immutable and reusable across multiple searches.

## `searchBy`

```ts
import { searchBy } from 'fuzzysort2'

const users = [
  { id: 1, name: 'Alec Larson' },
  { id: 2, name: 'Alex Russell' },
]

const result = searchBy('al lar', users, user => user.name)
```

`searchBy(query, values, extract, options)` searches one extracted target string per value and returns `ValueMatch<T>` results that keep the original `value`.

## `searchFields`

```ts
import { searchFields } from 'fuzzysort2'

const files = [
  { id: 1, name: 'CheatManager.h', path: 'src/ui/CheatManager.h' },
  { id: 2, name: 'Cheat', path: 'src/ui/Manager.h' },
]

const result = searchFields('c man', files, [
  { key: 'name', extract: file => file.name },
  { key: 'path', extract: file => file.path },
])
```

`searchFields(query, values, fields, options)` lets different query tokens match different named fields on the same value. Each `RecordMatch<T>` contains:

- `value`: the original record
- `score`: the record score
- `fields`: the contributing field matches, in field declaration order

## Highlighting

```ts
import { match, segments, highlight } from 'fuzzysort2'

const result = match('cman', 'CheatManager')

if (result) {
  console.log(segments(result))
  console.log(highlight(result))
  console.log(highlight(result, { open: '<b>', close: '</b>' }))
}
```

- `segments(match)` returns minimal alternating matched and unmatched text segments
- `highlight(match, options)` wraps matched segments with `open` and `close`

## Notes

- Empty queries always return no matches.
- Empty targets never match non-empty queries.
- Repeated query tokens are deduplicated after normalization.
- Runtime validation is limited to semantic constraints such as invalid `limit`, invalid `threshold`, and invalid field definitions.

## Legacy Mapping

- `single(...)` -> `match(...)`
- `go(query, targets)` -> `search(...)`
- `go(query, values, { key })` -> `searchBy(...)`
- `go(query, values, { keys })` -> `searchFields(...)`
- `prepare(...)` -> `prepare(...)`
- `result.highlight(...)` -> `highlight(result)` or `segments(result)`
- `cleanup()` -> removed
- `all` -> removed
- `scoreFn` -> removed
