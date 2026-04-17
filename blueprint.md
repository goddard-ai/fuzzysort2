# Fuzzysort2 Blueprint

Status: Checkpoint 0 blueprint. This document becomes frozen once committed. RED and GREEN checkpoints must implement against this document and must not revise it.

## Overview

`fuzzysort2` is a modern TypeScript-first fuzzy search library for:

- matching a query against one string
- searching arrays of strings
- searching arrays of values through one extracted string
- searching arrays of values through multiple named fields

The library is a clean break from `fuzzysort` v3. It keeps the useful search behavior and ranking intent, but drops legacy packaging, mutable prepared-result hybrids, global cleanup, and ambiguous edge-case behavior.

The public surface is intentionally small:

- `prepare`
- `match`
- `search`
- `searchBy`
- `searchFields`
- `segments`
- `highlight`

There is no global cache API and no mutable runtime singleton. Reuse is achieved through explicit `PreparedTarget` values returned by `prepare(...)`.

## Context

The old package is useful because it does more than substring search:

- it supports subsequence matching
- it rewards contiguous and boundary-aligned matches
- it handles multi-token queries
- it works well for command palettes, file search, code symbol search, and small-to-medium in-memory datasets

The old package is hard to evolve because:

- prepared targets and results share the same mutable runtime shape
- cache entries are mutated during matching
- multi-key aggregation is ad hoc
- the API reflects historical minification and packaging constraints

`fuzzysort2` exists to preserve the good product behavior while making the API, semantics, and implementation model explicit enough to support strict TDD and a maintainable rewrite.

## Goals

- Provide predictable fuzzy matching for strings and object data.
- Preserve the ranking priorities users actually care about:
  - contiguous matches
  - early matches
  - boundary-aligned matches
  - shorter targets
  - stable ordering
- Expose immutable prepared targets as the only public precomputation primitive.
- Return structured results instead of arrays with attached properties.
- Ship as named ESM exports with generated TypeScript declarations.
- Define enough semantics that the implementation can be built through frozen RED/GREEN checkpoints.

## Non-Goals

- Backward compatibility with `fuzzysort` v3 names or result shapes.
- A plugin system for custom scoring in the first release.
- Global caches or a `cleanup()` API.
- A persistence format for prepared targets.
- Browser-global or UMD packaging.
- Async search, incremental indexing, or out-of-process search.

## Success Criteria

This blueprint is successful if all of the following are true:

- Every public API listed here can be implemented without changing this document.
- The first RED suite can be written directly from the API and behavior defined here.
- Empty-query, empty-target, threshold, limit, and field-search behavior are unambiguous.
- The package can be explained to a user without referring to internal implementation details.

## Assumptions and Constraints

- The package targets modern JavaScript runtimes with ESM support.
- All search is in-memory and synchronous.
- Datasets fit in process memory.
- Callers who care about repeated search performance will explicitly retain prepared targets.
- Search quality is more important than reproducing the exact numeric scores from `fuzzysort` v3.
- The exact internal scoring coefficients are not public API; the public contract is the ranking behavior and normalized score range defined here.

## Terminology

- Query: the user-provided search string.
- Target: the string being matched.
- Prepared target: an immutable, opaque value returned by `prepare(target)`.
- Token: one normalized query term after trimming, whitespace splitting, empty-token removal, and duplicate removal.
- Boundary: a preferred match start position. Boundaries occur at the start of a string, after separators, at lowercase-to-uppercase transitions, and at letter-digit or digit-letter transitions.
- Match: the result of successfully matching a query or token set to one target.
- Field: a named extracted target string used by `searchFields(...)`.
- Range: a half-open character span `{ start, end }` on the original target string.

## Proposed Design

The package exports pure functions and immutable data values.

The design choices are:

- `prepare(...)` is the only public optimization primitive.
- Matching APIs accept either raw strings or prepared targets where applicable.
- Search results are returned as `{ items, total }`.
- Highlighting is not a method on result objects; it is handled by helpers that operate on match-like values.
- Record search is split into two explicit APIs:
  - `searchBy(...)` for one extracted target per value
  - `searchFields(...)` for multiple named fields

No public API depends on hidden cache lifetime or process-global mutable state.

## API Specification

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

### Public API Decisions

- `prepare(...)` remains public because explicit precomputation is the cleanest performance boundary.
- `match(...)` replaces `single(...)`.
- `search(...)` replaces plain `go(...)` on string arrays.
- `searchBy(...)` replaces object search through one extracted string.
- `searchFields(...)` replaces object search through multiple keys.
- `highlight(...)` and `segments(...)` replace result instance methods.
- There is no `cleanup()`.
- There is no `all` option.
- There is no `scoreFn`.

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

## Behavioral Semantics

### 1. Input Validation

- `prepare(...)` throws `TypeError` unless `target` is a string.
- `match(...)` throws `TypeError` unless `query` is a string and `target` is a string or a valid `PreparedTarget`.
- `search(...)` throws `TypeError` unless `query` is a string and `targets` is an array.
- `searchBy(...)` throws `TypeError` unless `query` is a string, `values` is an array, and `extract` is a function.
- `searchFields(...)` throws `TypeError` unless `query` is a string, `values` is an array, and `fields` is an array of valid field definitions.
- `searchFields(...)` throws `RangeError` if `fields.length === 0`.
- `searchFields(...)` throws `RangeError` if any field key is not a non-empty string.
- `searchFields(...)` throws `RangeError` if field keys are duplicated within one call.
- `SearchOptions.limit`, when provided, must be an integer greater than or equal to `0`; otherwise the call throws `RangeError`.
- `SearchOptions.threshold`, when provided, must be a finite number in the inclusive range `[0, 1]`; otherwise the call throws `RangeError`.
- `search(...)` throws `TypeError` if any target element is not a string or `PreparedTarget`.
- `searchBy(...)` and `searchFields(...)` throw `TypeError` if an extractor returns a value that is not a string, `PreparedTarget`, `null`, or `undefined`.
- `segments(...)` and `highlight(...)` throw `TypeError` unless passed a valid `HighlightableMatch`.

### 2. Normalization

All matching is performed against normalized query and target text.

Normalization rules:

- Text is lowercased.
- Latin-script accent marks are folded away.
- Non-Latin scripts are not decomposed beyond ordinary JavaScript lowercasing behavior.
- The original target string is preserved for returned results and highlighting.

### 3. Query Tokenization

Tokenization applies to all matching APIs.

Tokenization rules:

- The query is trimmed.
- The query is split on one or more whitespace characters.
- Empty tokens are discarded.
- Duplicate tokens are removed after normalization while preserving first occurrence order.

Examples:

- `"  c man  "` becomes `["c", "man"]`
- `"foo   foo bar"` becomes `["foo", "bar"]`
- `""` becomes `[]`

### 4. Empty Query Semantics

- `match("", target)` always returns `null`.
- `search("", targets)` returns `{ items: [], total: 0 }`.
- `searchBy("", values, extract)` returns `{ items: [], total: 0 }`.
- `searchFields("", values, fields)` returns `{ items: [], total: 0 }`.
- Empty-query search calls return before inspecting target elements or invoking extractors.

This behavior is deliberate. Callers that want "show all items on empty query" must implement that policy outside the library.

### 5. Empty Target Semantics

- `prepare("")` is valid.
- A non-empty query never matches an empty target.
- Empty extracted field values behave the same way as empty target strings.
- `null` and `undefined` extracted values are treated as absent targets, not empty strings.

### 6. Matching Rules For One Target

Given one normalized target and a tokenized query:

- If the query has no tokens, there is no match.
- If the query has one token, the token matches the target only if every character in the token appears in target order.
- If the query has multiple tokens, every token must match the same target.

For each successful token match:

- The winning placement is the highest-ranking valid character assignment within the target.
- If multiple placements tie, prefer:
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

The following ranking rules are part of the public contract:

- Exact normalized query-target equality scores `1`.
- Higher score means a better match.
- Contiguous matches are better than equally early non-contiguous matches.
- Matches that start earlier are better than otherwise comparable later matches.
- Boundary-aligned matches are better than otherwise comparable non-boundary matches.
- Shorter targets are better than otherwise comparable longer targets.
- For multi-token queries on one target, in-order non-overlapping token placements are better than out-of-order placements.
- If treating the full normalized query as one coherent match would rank better than the token-by-token aggregation, the coherent full-query match wins.

The exact coefficient values used to produce the score are intentionally not public API. The public API is the normalized score range, exact-match score, and the ranking priorities above.

### 8. Search Result Ordering

For `search(...)`, `searchBy(...)`, and `searchFields(...)`:

- Results are sorted by descending `score`.
- If two results have the same score, input order is preserved.
- `threshold` filters after the final score is computed.
- `limit` applies after sorting.
- `total` is the number of matches that remain after threshold filtering and before limit truncation.
- `limit: 0` returns no items and still reports the correct `total`.

### 9. `prepare(...)` Semantics

`prepare(target)` returns an immutable prepared target.

Prepared target guarantees:

- `prepared.target` is the original target string.
- The value is safe to reuse across multiple searches.
- The value is safe to reuse concurrently.
- The value does not carry per-search match state.

Prepared target non-guarantees:

- It is not a stable serialization format.
- It is not guaranteed to interoperate across major versions.
- Consumers must not construct `PreparedTarget` objects manually.

### 10. `searchBy(...)` Semantics

For each input value:

- `extract(value)` is called once per search.
- If the extractor returns `null` or `undefined`, the value is skipped.
- If the extractor returns a string or prepared target, matching proceeds exactly as if that target had been passed to `match(...)`.

Each returned `ValueMatch<T>` contains:

- `value`: the original input value
- `target`: the extracted target string
- `ranges`: the match ranges on that target
- `score`: the final normalized score for that extracted target

### 11. `searchFields(...)` Semantics

`searchFields(...)` exists for values that should match across multiple named text surfaces.

For each input value:

1. Normalize and tokenize the query.
2. Run each token against each present field target.
3. For each token, assign that token to the field match with the highest token score.
4. If any token cannot be assigned, the value does not match.
5. Merge the assigned token ranges per field.

Tie-breaking during token assignment:

- Prefer the higher token score.
- If token scores tie, prefer the assignment that uses fewer fields overall.
- If that still ties, prefer the field that appears earlier in the `fields` array.

Record result semantics:

- `RecordMatch.score` is the arithmetic mean of the assigned token scores after the final assignment is chosen.
- `RecordMatch.fields` contains one `FieldMatch` per contributing field, in field declaration order.
- `FieldMatch.key` is the field definition key.
- `FieldMatch.target` is the original field target string.
- `FieldMatch.ranges` are the merged assigned-token ranges on that field target.
- `FieldMatch.score` is the arithmetic mean of the token scores assigned to that field.

Consequences:

- A record can match even when different query tokens come from different fields.
- A record that satisfies the same token coverage with fewer contributing fields is preferred when the token scores tie.
- A field that did not contribute any assigned tokens is omitted from `RecordMatch.fields`.

### 12. `segments(...)` Semantics

`segments(match)` returns a minimal sequence of alternating target segments.

Guarantees:

- Concatenating all segment texts reproduces `match.target`.
- Empty segments are never returned.
- Adjacent segments never share the same `matched` value.
- Matched segments correspond exactly to `match.ranges`.

### 13. `highlight(...)` Semantics

`highlight(match, options)` is a string-formatting helper built on `segments(...)`.

Defaults:

- `open` defaults to `"<mark>"`
- `close` defaults to `"</mark>"`

Behavior:

- Unmatched segments are copied unchanged.
- Matched segments are wrapped with `open` and `close`.
- The function does not escape HTML.
- The function returns `match.target` unchanged when `match.ranges` is empty.

## Architecture / Data Flow

### Plain String Search

1. Validate inputs.
2. Normalize and tokenize the query.
3. For each target:
   - obtain normalized target data from the raw string or prepared target
   - attempt one-target matching
   - compute the final normalized score
4. Filter by threshold.
5. Order by descending score with stable ties.
6. Apply limit.
7. Return `{ items, total }`.

### `searchBy(...)`

1. Validate inputs.
2. Normalize and tokenize the query once.
3. For each value:
   - run the extractor once
   - skip absent targets
   - reuse the one-target matcher
4. Wrap successful matches with the original input value.
5. Filter, sort, limit, and return results.

### `searchFields(...)`

1. Validate inputs and field definitions.
2. Normalize and tokenize the query once.
3. For each value:
   - extract every field target
   - build per-token per-field candidate matches
   - compute the best field assignment for all tokens
   - produce a `RecordMatch<T>` when every token is covered
4. Filter, sort, limit, and return results.

State ownership:

- Query state lives inside one call.
- Prepared target state lives in caller-owned `PreparedTarget` values.
- There is no process-global cache lifecycle.

## Alternatives And Tradeoffs

### 1. Pure Functions Plus Prepared Targets vs Engine Instances

Decision:

- Use pure functions plus caller-owned prepared targets.

Why:

- This keeps lifecycle explicit.
- It avoids reintroducing global caches through an instance wrapper.
- It is easier to test with strict TDD.

Rejected alternative:

- A search engine instance with internal caches.

Tradeoff:

- We give up an internal owner for future cache policies, but gain a smaller and clearer API.

### 2. Structured Results vs Arrays With Attached Properties

Decision:

- Return `{ items, total }`.

Why:

- It is explicit and unsurprising in TypeScript.

Rejected alternative:

- Returning arrays with a `.total` property.

Tradeoff:

- Slightly more verbose destructuring in exchange for a cleaner contract.

### 3. Named Functions vs Overloaded `go(...)`

Decision:

- Use `match`, `search`, `searchBy`, and `searchFields`.

Why:

- The function name communicates the data shape.
- Call sites stay legible without option-object overload tricks.

Rejected alternative:

- One overloaded `search(...)` that switches behavior based on options.

Tradeoff:

- More exported names, but less ambiguity.

### 4. No `scoreFn` In The First Release

Decision:

- Do not expose custom score callbacks.

Why:

- A custom scorer would either leak internal ranking mechanics or make the public score contract unstable.

Rejected alternative:

- Recreate the old `scoreFn`.

Tradeoff:

- Less extensibility now, but a more coherent first release.

### 5. No Empty-Query Match-All Option

Decision:

- Empty query always means no match.

Why:

- It keeps the search contract simple and avoids result-shape special cases.

Rejected alternative:

- Built-in match-all behavior for empty queries.

Tradeoff:

- Callers must implement their own "show all" policy, but the library avoids a second result mode.

## Failure Modes And Edge Cases

- A query containing only whitespace behaves the same as an empty query.
- Repeated query tokens are deduplicated; callers must not rely on repetition changing the result.
- Empty strings are valid prepared or extracted targets, but they only match empty queries, and empty queries always return no match.
- Search helpers do not escape HTML. `highlight(...)` is unsafe for untrusted HTML injection contexts unless the caller escapes separately.
- `searchFields(...)` omits non-contributing fields from the returned `fields` array.
- `limit` can truncate `items`, but never changes `total`.
- Because scores are normalized and threshold operates on the final score, changing ranking internals is allowed only if the documented ordering rules and frozen ranking fixtures still hold.

## Testing And Observability

This blueprint is designed to drive the RED/GREEN checkpoint plan directly.

Checkpoint mapping:

- Checkpoint 1 covers `match(...)` and the base `Match` shape.
- Checkpoint 2 covers `search(...)`, `prepare(...)`, `limit`, `threshold`, and `total`.
- Checkpoint 3 covers boundary-aware ranking, `segments(...)`, and `highlight(...)`.
- Checkpoint 4 covers tokenization and multi-token matching on one target.
- Checkpoint 5 covers `searchBy(...)` and `searchFields(...)`.
- Checkpoint 6 covers exports, generated types, and README examples.

Testing requirements implied by this blueprint:

- exact normalized equality must score `1`
- empty query behavior must be covered for every search entry point
- tie handling must preserve input order
- range merging must be covered
- `searchFields(...)` token assignment semantics must be covered
- invalid option values must throw the documented error types

Observability:

- There is no runtime logging API in the first release.
- Benchmark fixtures belong in the repository but are not public API.

## Rollout And Migration

This package is intentionally not a drop-in upgrade.

Legacy to new API mapping:

- `single(...)` -> `match(...)`
- `go(query, targets)` -> `search(...)`
- `go(query, values, { key })` -> `searchBy(...)`
- `go(query, values, { keys })` -> `searchFields(...)`
- `prepare(...)` -> `prepare(...)`
- `result.highlight(...)` -> `highlight(result)` or `segments(result)`
- `cleanup()` -> removed
- `all` -> removed
- `scoreFn` -> removed

Migration consequences:

- Consumers must update imports to named ESM exports.
- Consumers that relied on array-plus-`.total` results must switch to `{ items, total }`.
- Consumers that relied on callback-based highlighting must rebuild that behavior from `segments(...)`.

## Open Questions

None.

## Ambiguities and Blockers

None. This blueprint is intended to be implementation-ready for the planned RED/GREEN checkpoints.

Resolved blueprint decisions:

- AB-1 - Resolved - Empty-query semantics
  - Affected area: Behavioral Semantics / API
  - Decision: Empty query returns no matches for all search entry points.
  - Why it matters: It removes result-shape special cases and keeps TDD checkpoints clean.

- AB-2 - Resolved - Cache ownership
  - Affected area: API / Architecture
  - Decision: The only public performance primitive is `PreparedTarget`; there is no global cleanup API.
  - Why it matters: It keeps prepared data immutable and caller-owned.

- AB-3 - Resolved - Object search surface
  - Affected area: API
  - Decision: Object search is split into `searchBy(...)` and `searchFields(...)` instead of an overloaded option shape.
  - Why it matters: It keeps the public contract explicit and reduces ambiguity during implementation.

## Appendix

### Ranking Fixture Intent

The implementation may tune internal coefficients, but the following intent is fixed:

- exact normalized equality is best
- coherent boundary-aligned substring matches outrank looser subsequence matches
- earlier coherent matches outrank later coherent matches
- shorter otherwise comparable targets outrank longer ones
- multi-token matches that keep tokens in order outrank otherwise comparable out-of-order matches
- `searchFields(...)` prefers the same token coverage achieved with fewer contributing fields when token scores tie

### Public Surface Summary

Named exports:

- `prepare`
- `match`
- `search`
- `searchBy`
- `searchFields`
- `segments`
- `highlight`

Exported types:

- `PreparedTarget`
- `MatchRange`
- `MatchSegment`
- `HighlightableMatch`
- `Match`
- `ValueMatch<T>`
- `FieldDefinition<T>`
- `FieldMatch`
- `RecordMatch<T>`
- `SearchResult<TMatch>`
- `SearchOptions`
