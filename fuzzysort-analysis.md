# Fuzzysort v3.0.2 Analysis

Scope: this document is based only on `./fuzzysort/fuzzysort.js` and `./fuzzysort/index.d.ts`.

## Executive Summary

`fuzzysort` is a small fuzzy-search engine with four exported runtime features:

- `single(search, target)` searches one target string.
- `go(search, targets, options)` searches many targets and returns the best matches.
- `prepare(target)` precomputes target metadata so repeated searches are faster.
- `cleanup()` clears internal preparation caches.

The package also exposes:

- rich result objects with `score`, `indexes`, and `highlight(...)`
- object searching through `key` or `keys`
- search-token handling for queries containing spaces
- accent-insensitive and case-insensitive matching
- a ranking algorithm that prefers contiguous matches, early matches, word-start matches, and shorter targets
- internal caching and scratch-buffer reuse for speed
- TypeScript declarations for the public API
- UMD packaging so the same file can work in AMD, CommonJS, or as a global

The implementation is very performance-driven. It duplicates hot loops, mutates cached prepared objects, reuses global arrays to reduce garbage collection, and keeps only the top `limit` matches with a heap.

## Source Map

- Runtime entry points and result helpers: `fuzzysort/fuzzysort.js:11-231`
- Result classes and score normalization: `fuzzysort/fuzzysort.js:240-276`
- Search preparation and caches: `fuzzysort/fuzzysort.js:279-316`
- Empty-search handling: `fuzzysort/fuzzysort.js:319-358`
- Core matching and scoring: `fuzzysort/fuzzysort.js:361-588`
- String normalization and word-boundary helpers: `fuzzysort/fuzzysort.js:590-651`
- Value extraction, caches, heap, exports: `fuzzysort/fuzzysort.js:653-690`
- Public TypeScript API: `fuzzysort/index.d.ts:1-94`

## Public API Features

### 1. `single(search, target)`

What it does:

- Fuzzy-matches one search string against one target string.
- Returns a `Result` object on success, or `null` on failure.

How it works:

- Rejects empty or falsy `search` and `target` immediately.
- Prepares the search with `getPreparedSearch(...)`.
- Accepts either a raw target string or a prepared target object.
- Uses a cheap bitflag prefilter before running the full algorithm.
- Calls `algorithm(preparedSearch, target)` to compute match indexes and score.

Important behavior:

- Empty strings do not match.
- The match is case-insensitive and accent-insensitive for Latin text.
- Returned `Result` includes the original target string, normalized score, highlight support, and matched character indexes.

Relevant code: `fuzzysort/fuzzysort.js:11-21`

### 2. `go(search, targets, options)`

What it does:

- Batch-searches an array of targets and returns matches sorted from best to worst.
- Supports three modes:
  - plain string/prepared targets
  - object search through one `key`
  - object search through multiple `keys`

How it works:

- If `search` is empty:
  - returns `all(targets, options)` when `options.all` is true
  - otherwise returns the shared empty results array with `total = 0`
- Prepares the search once.
- Converts `threshold` from public normalized score space into internal score space.
- Keeps at most `limit` best matches in a min-heap.
- Rebuilds the final results array by polling the heap so the returned array is best-first.
- Adds a `.total` property equal to all matches seen before truncation.

Relevant code: `fuzzysort/fuzzysort.js:23-170`

### 3. `options.threshold`

What it does:

- Filters out weak matches.

How it works:

- Public scores are documented as `0..1`.
- Runtime scores are actually stored in a separate internal scale where better matches are larger and `-Infinity` means no match.
- `go(...)` converts the user-provided normalized threshold with `denormalizeScore(...)`, then compares candidate `_score` values against it.

Relevant code: `fuzzysort/fuzzysort.js:30, 267-276`

### 4. `options.limit`

What it does:

- Caps how many results are returned.

How it works:

- `go(...)` uses a reused min-heap.
- The heap is filled until it reaches `limit`.
- After that, only candidates better than the current worst kept result replace the heap top.
- This means runtime is closer to "scan everything, keep top N" rather than "sort everything at the end".

Relevant code: `fuzzysort/fuzzysort.js:31, 36-41, 684-686`

### 5. `options.all`

What it does:

- Changes empty-search behavior from "no results" to "return everything".

How it works:

- `go(...)` calls `all(targets, options)` only when the search is empty and `all` is true.
- `all(...)` returns result-shaped objects without running the scoring algorithm.
- In plain-target and multi-key modes it explicitly resets `_score` to `-Infinity` and clears indexes.
- In `key` mode it creates a new result object using the current prepared target score, which can preserve stale state from earlier searches.

Relevant code: `fuzzysort/fuzzysort.js:23-24, 319-358`

### 6. `options.key`

What it does:

- Lets `go(...)` search objects instead of raw strings by extracting one target string from each object.

Accepted forms:

- direct property name: `"name"`
- dotted path string: `"user.profile.name"`
- path array: `["user", "profile", "name"]`
- accessor function: `(obj) => obj.name`

How it works:

- For each object, `getValue(obj, key)` resolves the string to search.
- That target is prepared if needed.
- The result returned by `algorithm(...)` is augmented with `result.obj = obj`.

Relevant code: `fuzzysort/fuzzysort.js:46-61, 666-675`

### 7. `options.keys`

What it does:

- Lets `go(...)` search multiple fields on each object and return a per-key result array plus one overall score.

How it works:

- It precomputes a combined bitflag OR across all keys so obviously impossible objects can be skipped before any deeper work.
- Each key is searched independently.
- The per-key outputs are collected into a `KeysResult`, which is an array subclass.
- `objResults.obj` stores the original object.
- `objResults.score` is derived from the best key, with a small bonus when multiple keys match.

Relevant code: `fuzzysort/fuzzysort.js:63-148`

Returned shape:

- `KeysResult[i]` is the match result for the `i`th key.
- `KeysResult.obj` is the original object.
- `KeysResult.score` is the aggregate score used for ranking.

### 8. `options.scoreFn`

What it does:

- Lets callers replace the default aggregate score for `keys` searches.

How it works:

- The package first computes the default `KeysResult`.
- It then calls `options.scoreFn(objResults)`.
- The returned normalized score is converted back into internal score space and stored on `objResults._score`.

Important quirk:

- `if(!score) continue` means a custom score of `0` discards the result entirely.
- Negative numbers are accepted because they are truthy.

Relevant code: `fuzzysort/fuzzysort.js:137-144`

### 9. `prepare(target)`

What it does:

- Precomputes search metadata for a target string so repeated searches avoid repeated setup work.

How it works:

- Numbers are stringified.
- Non-string, non-number input becomes `""`.
- `prepareLowerInfo(...)` computes lowercase character codes, bitflags, and space detection.
- The prepared result is stored in the same `Result`-shaped runtime object used elsewhere, but with extra hidden internal fields.

Relevant code: `fuzzysort/fuzzysort.js:224-229`

### 10. `cleanup()`

What it does:

- Clears the two preparation caches.

How it works:

- Empties `preparedCache` for targets.
- Empties `preparedSearchCache` for searches.
- Does not reset the shared heap or scratch arrays.

Relevant code: `fuzzysort/fuzzysort.js:231, 653-660`

### 11. Result objects

Runtime result features:

- `result.target`: original target string
- `result.score`: normalized public score
- `result.indexes`: sorted matched character positions
- `result.highlight(...)`: renders highlighted output
- `result.obj`: original object in `key` mode

How they work:

- `Result.score` is a getter/setter around `_score`, translating between internal and public score scales.
- `Result.indexes` returns a sorted copy of the internal mutable `_indexes` array.
- `Result.highlight(...)` delegates to the standalone `highlight(...)` helper.

Relevant code: `fuzzysort/fuzzysort.js:175-220, 240-264`

### 12. Highlighting

What it does:

- Produces highlighted output for matched character ranges.

Supported forms:

- `highlight("<b>", "</b>")` returns a single string.
- `highlight(callback)` returns an array alternating plain strings and callback outputs.

How it works:

- Walks the target string from left to right.
- Opens a highlight when it reaches the next matched index.
- Closes the highlight when the run of matched indexes ends.
- In callback mode it groups consecutive matched characters and passes each group to the callback with a match index counter.

Relevant code: `fuzzysort/fuzzysort.js:175-220`

## Matching Features And How They Work

### 13. Case-insensitive matching

How it works:

- Both search and target are lowercased before comparison.
- Matching itself is done against arrays of lowercased character codes.

Relevant code: `fuzzysort/fuzzysort.js:279-297, 593-617`

### 14. Accent-insensitive matching for Latin text

How it works:

- `remove_accents(...)` normalizes only Latin-script runs with NFD.
- It then removes combining accent marks.
- The comment explicitly says this avoids breaking Japanese text.

Effect:

- A plain Latin search term can match a Latin target that differs only by accent marks.
- Non-Latin scripts are not aggressively decomposed.

Relevant code: `fuzzysort/fuzzysort.js:590-595`

### 15. Fast reject using bitflags

What it does:

- Quickly rejects impossible targets before any expensive matching.

How it works:

- `prepareLowerInfo(...)` builds a 32-bit summary of which character classes appear in a string.
- Bits:
  - `0..25`: letters `a..z`
  - `26`: any digit
  - `30`: other ASCII
  - `31`: non-ASCII
- Space is excluded because spaced searches are handled separately.
- A target can only match if it contains at least the search's bitflags.

Relevant code: `fuzzysort/fuzzysort.js:17-18, 54, 70-83, 156, 593-617`

### 16. Basic fuzzy subsequence matching

What it does:

- Ensures every search character appears in the target in order.

How it works:

- `algorithm(...)` performs a first pass that walks the target left-to-right.
- Every time it finds the next needed character, it records that index.
- If it reaches the end before finding all characters, the match fails immediately.

This is the package's minimum notion of a match.

Relevant code: `fuzzysort/fuzzysort.js:374-385`

### 17. Strict matching on word starts and adjacency

What it does:

- Tries to improve ranking by preferring matches that stay consecutive or land on word starts.

How it works:

- The algorithm computes `_nextBeginningIndexes`, which tells it the next word-start or segment-start position after each index.
- It then attempts a stricter match pass that jumps only through those beginning indexes unless characters are consecutive.
- If strict matching gets stuck, it backtracks and tries to push earlier matches forward.
- Backtracking is capped at 200 attempts to avoid runaway cost.

Relevant code: `fuzzysort/fuzzysort.js:391-420, 635-650`

### 18. Word-start detection

What it does:

- Defines the boundary points the strict matcher prefers.

How it works:

- A new beginning is recorded when:
  - an uppercase letter follows a non-uppercase letter
  - a non-alphanumeric character is seen
  - an alphanumeric character follows a non-alphanumeric character

Practical effect:

- camelCase, PascalCase, snake-like separators, punctuation, and path delimiters all create boundaries that improve rank.

Relevant code: `fuzzysort/fuzzysort.js:619-650`

### 19. Substring bonuses

What it does:

- Rewards exact substring hits, especially when the substring starts at a word boundary.

How it works:

- After the basic and strict passes, the algorithm checks whether the full search string occurs as a contiguous substring.
- If that substring is not already at a beginning index, it scans later beginning indexes to see if a better boundary-aligned substring exists.
- Score bonuses are applied by dividing the otherwise negative penalty score, making it less negative and therefore better.

Relevant code: `fuzzysort/fuzzysort.js:422-487`

### 20. Score model

How internal scores behave:

- Better scores are larger.
- A perfect or near-perfect match is close to `0` internally and close to `1` publicly.
- `-Infinity` means "no match".

What the score rewards:

- fewer disjoint match groups
- lower starting index
- successful strict matching
- substring matches
- substring matches at beginning indexes
- shorter targets

What the score penalizes:

- gaps between matched characters
- matches that start later in the target
- long targets
- targets with many word beginnings when strict matching succeeds

Important implementation detail:

- The target-length penalty is applied twice.

Relevant code: `fuzzysort/fuzzysort.js:267-276, 441-471`

### 21. Searches containing spaces

What it does:

- Treats a spaced search as multiple tokens instead of one raw string, unless the exact spaced string scores better.

How it works:

- `prepareSearch(...)` trims the query, splits on whitespace, removes duplicates, and stores one prepared search per token.
- `algorithmSpaces(...)` runs the main algorithm once per token.
- In normal space mode every token must match.
- In partial-match mode at least one token must match.
- Matched indexes from all tokens are unioned into one result.
- An order penalty discourages out-of-order token hits.
- After the tokenized pass, the code also tries a direct full-string spaced search and keeps it if that score is better.

Relevant code: `fuzzysort/fuzzysort.js:285-296, 500-588`

### 22. Phrase-like multi-token chaining

What it does:

- Makes queries like `"straw berry"` match `"strawberry"` better than a naive independent-token search would.

How it works:

- After a token matches as one consecutive substring, the code temporarily edits `_nextBeginningIndexes` so the next token can treat the position immediately after that substring as a beginning index.
- Those mutations are recorded in `nextBeginningIndexesChanges` and restored afterward.

Relevant code: `fuzzysort/fuzzysort.js:528-550, 658`

### 23. Multi-key support for spaced searches

What it does:

- Allows different space-separated search terms to match different object keys.

How it works:

- In `keys` mode, each key is searched with `allowPartialMatch = containsSpace`.
- Each token's best score across keys is tracked in `keysSpacesBestScores`.
- The object only matches if every token found at least one key-level match.
- The final object score is the sum of the best token scores.

Relevant code: `fuzzysort/fuzzysort.js:85-120`

## Performance Features

### 24. Prepared target cache

How it works:

- Short targets are cached in `preparedCache`.
- Targets longer than 999 characters bypass the cache.

Relevant code: `fuzzysort/fuzzysort.js:301-308`

### 25. Prepared search cache

How it works:

- Short searches are cached in `preparedSearchCache`.
- Searches longer than 999 characters bypass the cache.

Relevant code: `fuzzysort/fuzzysort.js:309-316`

### 26. Reused scratch buffers

How it works:

- Several arrays are module-level globals instead of per-search allocations:
  - `matchesSimple`
  - `matchesStrict`
  - `nextBeginningIndexesChanges`
  - `keysSpacesBestScores`
  - `allowPartialMatchScores`
  - `tmpTargets`
  - `tmpResults`

Why it exists:

- To reduce garbage creation in hot search paths.

Relevant code: `fuzzysort/fuzzysort.js:656-660`

### 27. Heap-based top-N selection

How it works:

- The package uses a hacked `FastPriorityQueue`.
- The queue is reused across searches.
- This avoids sorting every candidate when only the best `limit` results are needed.

Relevant code: `fuzzysort/fuzzysort.js:684-686`

## TypeScript Surface

`index.d.ts` declares:

- `Result`, `Results`
- `KeyResult<T>`, `KeyResults<T>`
- `KeysResult<T>`, `KeysResults<T>`
- `Prepared`
- `Options`, `KeyOptions<T>`, `KeysOptions<T>`
- overloads for `single(...)`, `go(...)`, `prepare(...)`, `cleanup()`
- CommonJS-style `export = fuzzysort`

What the types tell us about intended usage:

- public scores are expected to be normalized `0..1`
- prepared targets are an optimization, not a separate public data structure
- `key` and `keys` are first-class API features
- callback-based highlighting is part of the official API

Relevant code: `fuzzysort/index.d.ts:1-94`

## Behavioral Quirks And Modernization Notes

These are current behaviors, not necessarily good API design:

- `go(...)` skips falsy targets in normal search paths, so empty strings do not participate as searchable targets. Relevant code: `fuzzysort/fuzzysort.js:51, 75, 153`
- `all(...)` admits `""` because it checks `== null` instead of general falsiness. Relevant code: `fuzzysort/fuzzysort.js:327, 349`
- `all(..., { key })` can preserve stale scores from cached prepared targets because it copies `target._score` without resetting it. Relevant code: `fuzzysort/fuzzysort.js:324-330`
- `all(...).total` is acknowledged by the source comment as potentially wrong when some targets are skipped. Relevant code: `fuzzysort/fuzzysort.js:320`
- `keys` scoring contains inline comments from the original author saying the aggregation seems "weird and wrong". Relevant code: `fuzzysort/fuzzysort.js:94-100, 122-133`
- `scoreFn` cannot intentionally return `0` as a valid score because `0` is treated as "skip this result". Relevant code: `fuzzysort/fuzzysort.js:139-142`
- prepared targets are mutable objects that carry `_score`, `_indexes`, and `_nextBeginningIndexes`; cache entries are reused and mutated across searches. Relevant code: `fuzzysort/fuzzysort.js:253-263, 301-308, 489-497`
- `Result.indexes` sorts on access, which hides the fact that some internal match-index collections are not guaranteed to be stored sorted. Relevant code: `fuzzysort/fuzzysort.js:241, 583-585`
- runtime `prepare(...)` accepts numbers, but the declaration file only advertises `string`. Relevant code: `fuzzysort/fuzzysort.js:224-226`, `fuzzysort/index.d.ts:82`
- the runtime bundle is UMD and heavily minification-oriented, which is useful historically but probably unnecessary for a modern TypeScript-first rewrite. Relevant code: `fuzzysort/fuzzysort.js:3-8, 688-689`

## Bottom Line

Feature-wise, the package is not just "fuzzy substring search." It is a ranking engine with:

- single-target search
- batch search
- object-field search
- multi-field search
- per-result highlighting
- prepared-target reuse
- tokenized spaced-query matching
- word-boundary-aware ranking
- accent folding for Latin text
- result limiting and thresholding
- TypeScript declarations

Most of the implementation complexity comes from ranking quality and performance shortcuts, not from API size. If the modernization effort does not need compatibility, the main redesign opportunities are:

- defining a cleaner public data model for prepared targets and results
- separating immutable prepared data from per-search match state
- rewriting `keys` and spaced-query aggregation more explicitly
- removing UMD/minification-era constraints
- making empty-search and empty-target behavior deliberate instead of accidental
