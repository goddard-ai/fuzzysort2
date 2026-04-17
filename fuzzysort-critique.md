# Fuzzysort Modernization Critique

Scope: this is a preliminary plan for a compatibility-breaking modernization of the current `fuzzysort` package, based on `./fuzzysort/fuzzysort.js` and `./fuzzysort/index.d.ts`.

Assumption: we are optimizing for a modern TypeScript-first package, not for preserving legacy packaging, legacy API quirks, or historical implementation constraints.

## Position

The current package has a small, useful core and a messy execution model around it.

What is worth preserving is mostly conceptual:

- fuzzy subsequence matching
- strong ranking for contiguous and boundary-aligned matches
- efficient repeated searching through prepared targets
- object-field search
- highlight output
- good performance on large candidate sets

What should not survive is the current shape of the internals:

- mutable prepared objects that double as result objects
- shared module-global scratch state
- minification-oriented code structure
- UMD packaging
- ambiguous edge-case behavior around empty input, scores, and `all`

The right direction is not "port this code to TypeScript." The right direction is "redefine the model, then reimplement the good ideas cleanly."

## Keep

These are the parts of the package that represent real product value and should survive the rewrite in some form.

### 1. Keep fuzzy subsequence matching as the baseline

Why:

- It is the package's core capability.
- Users expect `"fs"` to match `"FuzzySort"` and similar non-substring patterns.
- It gives much better search recall than pure substring search.

Plan:

- Preserve subsequence matching as the minimum valid match rule.
- Keep exact/contiguous substring matches as a stronger ranking signal, not as the only match type.

### 2. Keep the ranking priorities

What to preserve:

- contiguous matches are better
- earlier matches are better
- boundary-aligned matches are better
- shorter targets are usually better
- exact substring matches should rank very well

Why:

- These heuristics are the main reason the package is useful rather than merely functional.
- The current implementation is rough, but the ranking intent is sound.

Plan:

- Preserve these ranking ideas explicitly in a documented scoring model.
- Stop treating the current formula as sacred; keep the goals, not the exact arithmetic.

### 3. Keep prepared targets

Why:

- Repeated searches over stable data sets are a real use case.
- Precomputation is the right optimization boundary.

Plan:

- Keep a preparation step, but make prepared targets immutable and structurally distinct from search results.
- Treat preparation as a first-class API, not a side effect hiding inside result objects.

### 4. Keep batch search with result limiting

Why:

- The package is mainly useful for ranked search over many targets.
- `limit` is operationally important for UI search and command palettes.

Plan:

- Keep top-N searching.
- Preserve efficient selection instead of sorting the full candidate set by default.

### 5. Keep object-field search

Why:

- Searching arrays of objects is a common consumer use case.
- The distinction between searching raw strings and searching data records is worth preserving.

Plan:

- Keep support for single-field and multi-field search.
- Redesign the API so field access is explicit and typed, rather than depending on a grab bag of path formats.

### 6. Keep highlighting support

Why:

- Highlighting is a real downstream need, not just a demo feature.
- Exposing match ranges is useful even if the built-in formatter changes.

Plan:

- Keep matched indexes or ranges in results.
- Consider making the primitive "ranges" and layering string-formatting helpers on top.

### 7. Keep tokenized space-aware search

Why:

- Queries with spaces are common in real search UIs.
- Matching multiple terms across a target or across multiple keys is good behavior.

Plan:

- Keep multi-token search semantics.
- Rebuild them with a real tokenizer and a clearer aggregation model.

## Improve

These areas are worth keeping in principle, but the current implementation is too implicit, too stateful, or too hard to reason about.

### 1. Improve the data model

Problem:

- Prepared targets, temporary match state, and public result objects are entangled.
- Cached prepared objects are mutated during search.

Why it matters:

- It makes behavior harder to trust.
- It creates stale-state hazards.
- It makes concurrency and reentrancy harder.

Plan:

- Separate:
  - immutable prepared target data
  - per-search scratch state
  - public result objects
- Never let cache entries carry match-specific state like score or indexes.

### 2. Improve the score model

Problem:

- Public scores are normalized through a non-obvious transform.
- Internal scores are hard to interpret.
- The current formula has arbitrary constants and at least one visibly duplicated penalty.

Why it matters:

- Consumers cannot reason about thresholds well.
- Maintainers cannot tune ranking confidently.

Plan:

- Replace the hidden score transform with one documented scoring contract.
- Prefer either:
  - a clear monotonic raw score with documented interpretation, or
  - a normalized score produced from a simpler, explicit formula
- Add targeted ranking fixtures so score changes are intentional.

### 3. Improve multi-key aggregation

Problem:

- The current `keys` aggregation is acknowledged in the source as questionable.
- Multi-key and spaced-query scoring are especially ad hoc.

Why it matters:

- These paths are the most likely to produce unintuitive rankings.
- They are also the hardest parts to maintain.

Plan:

- Define explicit aggregation rules:
  - how best-field ranking works
  - when multiple fields should add value
  - how token coverage across fields should be rewarded
- Represent token-to-field assignment directly instead of leaking it through shared scratch arrays.

### 4. Improve tokenization and text normalization

Problem:

- Space handling is coupled to the matcher in a special-case way.
- Normalization is partly thoughtful, but incomplete as a broader text-processing model.

Why it matters:

- Search quality depends heavily on tokenization behavior.
- International behavior should be deliberate.

Plan:

- Introduce explicit query preprocessing:
  - trim
  - tokenize
  - dedupe or do not dedupe based on an intentional rule
  - normalize case
  - normalize accents according to a documented policy
- Decide whether normalization is:
  - built-in and fixed
  - configurable
  - pluggable

### 5. Improve the boundary model

Problem:

- Boundary detection is useful but simplistic and encoded indirectly through `nextBeginningIndexes`.

Why it matters:

- Boundaries drive ranking quality for file names, code symbols, paths, and human-readable labels.

Plan:

- Keep boundary-aware ranking, but compute explicit boundary metadata during preparation.
- Make boundary categories inspectable in code and tests.

### 6. Improve the API shape

Problem:

- The current API is small but uneven.
- `key`, `keys`, `scoreFn`, `prepare`, `cleanup`, and `highlight` fit together loosely rather than as a coherent model.

Plan:

- Redesign the package around a clearer top-level API, likely one of:
  - pure functions with immutable prepared values
  - an engine/index instance with explicit configuration and cache lifetime
- Make result types explicit and stable.
- Make multi-field search a designed feature rather than an overload accident.

### 7. Improve packaging and types

Problem:

- The runtime is UMD and minification-shaped.
- The declaration file does not fully match runtime behavior.

Plan:

- Ship modern ESM-first output, with CJS only if there is a concrete reason.
- Author in TypeScript.
- Generate declarations from source instead of maintaining them separately.
- Keep the runtime and type surface aligned.

### 8. Improve correctness and testability

Problem:

- Several behaviors appear accidental rather than designed.
- There is no visible separation between ranking policy and optimization machinery.

Plan:

- Build a test suite around behavior categories:
  - exact matches
  - subsequence matches
  - boundary matches
  - tokenized queries
  - multi-key queries
  - Unicode and accent handling
  - empty input behavior
  - score thresholds and limits
- Add benchmark coverage so performance work stays evidence-based.

## Drop

These parts are implementation debt or legacy API baggage and should be removed rather than preserved.

### 1. Drop UMD and browser-global packaging

Why:

- This is legacy distribution strategy.
- It distorts the source structure for minimal present-day value.

Replacement:

- Modern package exports with ESM-first publishing.

### 2. Drop minification-oriented source style

Why:

- The current code is shaped for terseness and old-school bundle concerns.
- It makes maintenance harder than necessary.

Replacement:

- Write readable source first.
- Let the build tool handle minification and output shaping.

### 3. Drop mutable prepared/result hybrids

Why:

- This is the most important internal design flaw.
- It couples caches, results, and temporary search state.

Replacement:

- Immutable prepared targets and separate result values.

### 4. Drop shared module-global scratch state

Why:

- It makes the implementation harder to reason about.
- It creates subtle state coupling across searches.

Replacement:

- Use per-search scratch objects, pooled only if benchmarks show a real need.

### 5. Drop `cleanup()` as a required consumer concern

Why:

- Manual cache lifecycle is usually a sign that the cache model is wrong.
- In a modern design, cache ownership should be explicit.

Replacement:

- Either:
  - no global caches at all, or
  - an explicit engine/index instance that owns its own caches and can be discarded

### 6. Drop accidental empty-input behavior

Current issues:

- empty strings are skipped in some paths and admitted in others
- `all` has inconsistent semantics
- `total` can be knowingly inaccurate

Replacement:

- Define empty query and empty target behavior deliberately and test it.
- Ensure `total` always means one thing and is always correct.

### 7. Drop the current `key` path-resolution grab bag

Why:

- supporting string keys, dotted paths, path arrays, and callbacks in one slot is convenient but muddy
- it weakens typing and complicates implementation

Replacement:

- Prefer explicit accessors.
- If property-path convenience is desired, add it as a separate helper rather than mixing it into the core matcher.

### 8. Drop the current `scoreFn` contract

Why:

- It hooks into an unstable aggregate score model.
- The current truthiness check makes `0` unusable as a valid output.

Replacement:

- If custom ranking is needed, define a more principled extension point:
  - rerank after matching
  - weighted field configuration
  - custom comparator hooks

### 9. Drop ad hoc result arrays with attached properties

Why:

- Arrays with extra fields like `.total` are clever but awkward.
- They are less explicit than a dedicated result object.

Replacement:

- Return structured result containers, for example:
  - `{ items, total }`
  - `{ matches, total }`

### 10. Drop CommonJS-era type shapes if they get in the way

Why:

- `export =` matches the old packaging, not necessarily the best modern API.

Replacement:

- Use standard modern exports unless there is a strong compatibility reason not to.

## Preliminary Plan

This is the implementation path I would recommend.

### Phase 1. Lock down intended behavior

Goal:

- Preserve the valuable semantics without preserving accidental behavior.

Work:

- turn the current analysis into an explicit rewrite spec
- choose the behaviors we want to preserve
- write ranking fixtures for representative cases
- define exact semantics for:
  - empty queries
  - empty targets
  - thresholds
  - tokenized queries
  - multi-field queries
  - highlighting payload

Output:

- a behavioral spec and benchmark corpus

### Phase 2. Design a clean public API

Goal:

- Make the package understandable before implementing optimizations.

Work:

- choose whether the core abstraction is:
  - pure functions
  - a search engine instance
  - both
- define result shapes
- define prepared-target shapes
- define field configuration for object search
- decide how custom ranking extensions should work

Output:

- API proposal and types-first model

### Phase 3. Reimplement the core matcher cleanly

Goal:

- Build a maintainable baseline implementation.

Work:

- implement preprocessing and preparation
- implement subsequence matching
- implement boundary metadata
- implement tokenized query matching
- implement multi-field aggregation
- implement highlighting based on stable match ranges

Constraint:

- No cache entry should ever hold per-search result state.

### Phase 4. Optimize with benchmarks

Goal:

- Recover performance without reintroducing unclear architecture.

Work:

- benchmark preparation-heavy and search-heavy workloads
- add top-N selection only where it matters
- profile allocations before adding pooling
- only reintroduce low-level optimizations that are justified by measurement

### Phase 5. Finalize packaging and migration docs

Goal:

- Ship a modern package that is easy to consume.

Work:

- publish TypeScript-generated declarations
- publish modern module outputs
- document the new scoring model
- document migration from legacy `fuzzysort`

## Recommended Rewrite Priorities

If we want the shortest path to a better package, the highest-value priorities are:

1. Redesign prepared targets and results so they are immutable and separate.
2. Replace the current score model with a documented, test-backed ranking model.
3. Redesign multi-key and tokenized-query aggregation.
4. Move to a modern TypeScript and ESM-first codebase.
5. Reintroduce only the optimizations that benchmarks prove necessary.

## Bottom Line

We should keep the search product, not the current architecture.

Keep:

- subsequence matching
- boundary-aware ranking
- prepared targets
- batch search
- object search
- highlighting
- tokenized queries

Improve:

- data model
- scoring clarity
- aggregation logic
- normalization and tokenization
- API coherence
- type/runtime alignment
- testability

Drop:

- UMD
- minification-shaped source
- mutable prepared/result hybrids
- shared global scratch state
- manual global cache cleanup
- accidental edge-case behavior
- path-resolution overloads in the core API
- ad hoc score customization
- array-plus-properties result containers
