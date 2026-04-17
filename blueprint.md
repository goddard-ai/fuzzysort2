# Fuzzysort2 Blueprint

Status: frozen Checkpoint 0 blueprint. RED and GREEN checkpoints must implement against this document and must not revise it.

## Purpose

`fuzzysort2` is an in-memory fuzzy search library for:

- matching one query against one string
- searching arrays of strings
- searching arrays of values through one extracted string
- searching arrays of values through multiple named fields

This document is the implementation contract for the first release.

## Scope

The first release includes:

- named ESM exports only
- immutable prepared targets
- single-target matching
- string-array search
- one-field record search
- multi-field record search
- match segmentation and highlighting helpers

The first release does not include:

- backward compatibility with `fuzzysort` v3 result shapes
- global caches or `cleanup()`
- callback-based score customization
- match-all behavior for empty queries
- async search
- plugin hooks

## Terminology

- Query: the user-provided search string.
- Target: the string being matched.
- Prepared target: an opaque immutable value returned by `prepare(target)`.
- Token: one normalized query term after trimming, whitespace splitting, empty-token removal, and duplicate removal.
- Boundary: a preferred match start position. Boundaries occur at the start of a string, after separators, at lowercase-to-uppercase transitions, and at letter-digit or digit-letter transitions.
- Range: a half-open character span `{ start, end }` on the original target string.
- Match: a successful query-to-target result.
- Field: one named extracted target string in `searchFields(...)`.

## Public API

The package exports named values only.

### Exported Types

```ts
export interface PreparedTarget {
  readonly target: string
}

export interface MatchRange {
  readonly start: number
  readonly end: number
}

export interface MatchSegment {
  readonly text: string
  readonly matched: boolean
}

export interface HighlightableMatch {
  readonly target: string
  readonly ranges: readonly MatchRange[]
}

export interface Match extends HighlightableMatch {
  readonly score: number
}

export interface ValueMatch<T> extends Match {
  readonly value: T
}

export interface FieldDefinition<T> {
  readonly key: string
  readonly extract: (value: T) => string | PreparedTarget | null | undefined
}

export interface FieldMatch extends Match {
  readonly key: string
}

export interface RecordMatch<T> {
  readonly value: T
  readonly score: number
  readonly fields: readonly FieldMatch[]
}

export interface SearchResult<TMatch> {
  readonly items: readonly TMatch[]
  readonly total: number
}

export interface SearchOptions {
  readonly limit?: number
  readonly threshold?: number
}
```

### Exported Functions

```ts
export function prepare(target: string): PreparedTarget

export function match(
  query: string,
  target: string | PreparedTarget,
): Match | null

export function search(
  query: string,
  targets: readonly (string | PreparedTarget)[],
  options?: SearchOptions,
): SearchResult<Match>

export function searchBy<T>(
  query: string,
  values: readonly T[],
  extract: (value: T) => string | PreparedTarget | null | undefined,
  options?: SearchOptions,
): SearchResult<ValueMatch<T>>

export function searchFields<T>(
  query: string,
  values: readonly T[],
  fields: readonly FieldDefinition<T>[],
  options?: SearchOptions,
): SearchResult<RecordMatch<T>>

export function segments(
  match: HighlightableMatch,
): readonly MatchSegment[]

export function highlight(
  match: HighlightableMatch,
  options?: { open?: string; close?: string },
): string
```

## Canonical Usage Examples

### `prepare(...)`

```ts
import { prepare, search } from 'fuzzysort2'

const targets = [
  prepare('CheatManager.h'),
  prepare('Manifest.cpp'),
  prepare('CheatManager.cpp'),
]

const result = search('c man', targets)
```

### `match(...)`

```ts
import { highlight, match } from 'fuzzysort2'

const hit = match('fs', 'FuzzySort')

if (hit) {
  console.log(hit.score)
  console.log(highlight(hit))
}
```

### `search(...)`

```ts
import { search } from 'fuzzysort2'

const result = search('c man', [
  'CheatManager.h',
  'Manifest.cpp',
  'CheatManager.cpp',
], {
  limit: 5,
  threshold: 0.35,
})

console.log(result.total)
console.log(result.items.map(item => item.target))
```

### `searchBy(...)`

```ts
import { searchBy } from 'fuzzysort2'

const users = [
  { id: 1, name: 'Alec Larson' },
  { id: 2, name: 'Alex Russell' },
]

const result = searchBy('al lar', users, user => user.name)

console.log(result.items[0].value.id)
console.log(result.items[0].target)
```

### `searchFields(...)`

```ts
import { searchFields } from 'fuzzysort2'

const files = [
  { id: 1, name: 'CheatManager.h', path: 'src/ui/CheatManager.h' },
  { id: 2, name: 'Manifest.cpp', path: 'src/app/Manifest.cpp' },
]

const result = searchFields('c man', files, [
  { key: 'name', extract: file => file.name },
  { key: 'path', extract: file => file.path },
])

console.log(result.items[0].value.id)
console.log(result.items[0].fields.map(field => field.key))
```

### `segments(...)`

```ts
import { match, segments } from 'fuzzysort2'

const hit = match('cman', 'CheatManager')

if (hit) {
  const parts = segments(hit)
  // [
  //   { text: 'C', matched: true },
  //   { text: 'heat', matched: false },
  //   { text: 'Man', matched: true },
  //   { text: 'ager', matched: false },
  // ]
}
```

### `highlight(...)`

```ts
import { highlight, match } from 'fuzzysort2'

const hit = match('cman', 'CheatManager')

if (hit) {
  console.log(highlight(hit, { open: '<b>', close: '</b>' }))
}
```

## Semantics

### 1. Runtime Validation Policy

- The library does not perform general runtime type validation for argument shapes that are already covered by the published TypeScript signatures.
- Passing values outside the published TypeScript contract is unsupported behavior.
- Runtime validation is reserved for semantic constraints that TypeScript cannot express precisely.
- `searchFields(...)` throws `RangeError` if `fields.length === 0`.
- `searchFields(...)` throws `RangeError` if any field key is an empty string.
- `searchFields(...)` throws `RangeError` if field keys are duplicated within one call.
- `SearchOptions.limit`, when provided, must be an integer greater than or equal to `0`; otherwise the call throws `RangeError`.
- `SearchOptions.threshold`, when provided, must be a finite number in the inclusive range `[0, 1]`; otherwise the call throws `RangeError`.

### 2. Normalization

All matching is performed against normalized query and target text.

Normalization rules:

- text is lowercased
- Latin-script accent marks are folded away
- non-Latin scripts are not decomposed beyond ordinary JavaScript lowercasing behavior
- the original target string is preserved for returned results and highlighting

### 3. Query Tokenization

Tokenization applies to all matching APIs.

Tokenization rules:

- the query is trimmed
- the query is split on one or more whitespace characters
- empty tokens are discarded
- duplicate tokens are removed after normalization while preserving first-occurrence order

Examples:

- `"  c man  "` becomes `["c", "man"]`
- `"foo   foo bar"` becomes `["foo", "bar"]`
- `""` becomes `[]`

### 4. Empty Query Semantics

- `match("", target)` returns `null`
- `search("", targets)` returns `{ items: [], total: 0 }`
- `searchBy("", values, extract)` returns `{ items: [], total: 0 }`
- `searchFields("", values, fields)` returns `{ items: [], total: 0 }`
- empty-query search calls return before inspecting target elements or invoking extractors

### 5. Empty Target Semantics

- `prepare("")` is valid
- a non-empty query never matches an empty target
- empty extracted field values behave the same way as empty target strings
- `null` and `undefined` extracted values are treated as absent targets, not empty strings

### 6. Matching Rules For One Target

Given one normalized target and a tokenized query:

- if the query has no tokens, there is no match
- if the query has one token, the token matches the target only if every character in the token appears in target order
- if the query has multiple tokens, every token must match the same target

For each successful token match:

- the winning placement is the highest-ranking valid character assignment within the target
- if multiple placements tie, prefer:
  1. the earlier first matched character
  2. fewer ranges
  3. the shorter covered span

Returned `ranges` are:

- sorted by ascending `start`
- non-overlapping
- half-open
- merged so that consecutive matched characters share one range

### 7. Ranking Rules For One Target

Successful matches have a normalized score in the interval `(0, 1]`.

The following are public contract rules:

- exact normalized query-target equality scores `1`
- higher score means a better match
- contiguous matches are better than equally early non-contiguous matches
- matches that start earlier are better than otherwise comparable later matches
- boundary-aligned matches are better than otherwise comparable non-boundary matches
- shorter targets are better than otherwise comparable longer targets
- for multi-token queries on one target, in-order non-overlapping token placements are better than out-of-order placements
- if treating the full normalized query as one coherent match would rank better than the token-by-token aggregation, the coherent full-query match wins

The exact internal coefficient values are not public API.

### 8. Search Result Ordering

For `search(...)`, `searchBy(...)`, and `searchFields(...)`:

- results are sorted by descending `score`
- if two results have the same score, input order is preserved
- `threshold` filters after the final score is computed
- `limit` applies after sorting
- `total` is the number of matches that remain after threshold filtering and before limit truncation
- `limit: 0` returns no items and still reports the correct `total`

### 9. `prepare(...)`

`prepare(target)` returns an immutable prepared target.

Prepared target guarantees:

- `prepared.target` is the original target string
- the value is safe to reuse across multiple searches
- the value is safe to reuse concurrently
- the value does not carry per-search match state

Prepared target non-guarantees:

- it is not a stable serialization format
- it is not guaranteed to interoperate across major versions
- consumers must not construct `PreparedTarget` objects manually

### 10. `searchBy(...)`

For each input value:

- `extract(value)` is called once per search
- if the extractor returns `null` or `undefined`, the value is skipped
- if the extractor returns a string or prepared target, matching proceeds exactly as if that target had been passed to `match(...)`

Each returned `ValueMatch<T>` contains:

- `value`: the original input value
- `target`: the extracted target string
- `ranges`: the match ranges on that target
- `score`: the final normalized score for that extracted target

### 11. `searchFields(...)`

For each input value:

1. normalize and tokenize the query
2. run each token against each present field target
3. for each token, assign that token to the field match with the highest token score
4. if any token cannot be assigned, the value does not match
5. merge the assigned token ranges per field

Tie-breaking during token assignment:

- prefer the higher token score
- if token scores tie, prefer the assignment that uses fewer fields overall
- if that still ties, prefer the field that appears earlier in the `fields` array

Record result semantics:

- `RecordMatch.score` is the arithmetic mean of the assigned token scores after the final assignment is chosen
- `RecordMatch.fields` contains one `FieldMatch` per contributing field, in field declaration order
- `FieldMatch.key` is the field definition key
- `FieldMatch.target` is the original field target string
- `FieldMatch.ranges` are the merged assigned-token ranges on that field target
- `FieldMatch.score` is the arithmetic mean of the token scores assigned to that field

Consequences:

- a record can match even when different query tokens come from different fields
- a record that satisfies the same token coverage with fewer contributing fields is preferred when the token scores tie
- a field that did not contribute any assigned tokens is omitted from `RecordMatch.fields`

### 12. `segments(...)`

`segments(match)` returns a minimal sequence of alternating target segments.

Guarantees:

- concatenating all segment texts reproduces `match.target`
- empty segments are never returned
- adjacent segments never share the same `matched` value
- matched segments correspond exactly to `match.ranges`

### 13. `highlight(...)`

`highlight(match, options)` is a string-formatting helper built on `segments(...)`.

Defaults:

- `open` defaults to `"<mark>"`
- `close` defaults to `"</mark>"`

Behavior:

- unmatched segments are copied unchanged
- matched segments are wrapped with `open` and `close`
- the function does not escape HTML
- the function returns `match.target` unchanged when `match.ranges` is empty

## Execution Model

### Plain String Search

1. apply runtime semantic checks defined by this blueprint
2. normalize and tokenize the query
3. for each target:
   - obtain normalized target data from the raw string or prepared target
   - attempt one-target matching
   - compute the final normalized score
4. filter by threshold
5. order by descending score with stable ties
6. apply limit
7. return `{ items, total }`

### `searchBy(...)`

1. apply runtime semantic checks defined by this blueprint
2. normalize and tokenize the query once
3. for each value:
   - run the extractor once
   - skip absent targets
   - reuse the one-target matcher
4. wrap successful matches with the original input value
5. filter, sort, limit, and return results

### `searchFields(...)`

1. apply runtime semantic checks defined by this blueprint
2. normalize and tokenize the query once
3. for each value:
   - extract every field target
   - build per-token per-field candidate matches
   - compute the best field assignment for all tokens
   - produce a `RecordMatch<T>` when every token is covered
4. filter, sort, limit, and return results

State ownership:

- query state lives inside one call
- prepared target state lives in caller-owned `PreparedTarget` values
- there is no process-global cache lifecycle

## Checkpoint Coverage

- Checkpoint 1 covers `match(...)` and the base `Match` shape
- Checkpoint 2 covers `search(...)`, `prepare(...)`, `limit`, `threshold`, and `total`
- Checkpoint 3 covers boundary-aware ranking, `segments(...)`, and `highlight(...)`
- Checkpoint 4 covers tokenization and multi-token matching on one target
- Checkpoint 5 covers `searchBy(...)` and `searchFields(...)`
- Checkpoint 6 covers exports, generated types, and README examples

## Required Test Coverage

- exact normalized equality must score `1`
- empty query behavior must be covered for every search entry point
- tie handling must preserve input order
- range merging must be covered
- `searchFields(...)` token assignment semantics must be covered
- semantic constraint violations must throw the documented error types

## Legacy API Mapping

- `single(...)` -> `match(...)`
- `go(query, targets)` -> `search(...)`
- `go(query, values, { key })` -> `searchBy(...)`
- `go(query, values, { keys })` -> `searchFields(...)`
- `prepare(...)` -> `prepare(...)`
- `result.highlight(...)` -> `highlight(result)` or `segments(result)`
- `cleanup()` -> removed
- `all` -> removed
- `scoreFn` -> removed
