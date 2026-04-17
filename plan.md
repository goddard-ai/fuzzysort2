# Fuzzysort2 Implementation Plan

Status: planning only. No blueprint, tests, or implementation work begins until this document is reviewed and you give explicit go-ahead.

## Working Rules

1. Checkpoint 0 is a blueprint-only checkpoint.
2. The blueprint will explicitly define every public API surface and include canonical usage examples.
3. Once Checkpoint 0 is committed, the blueprint is frozen and will not be edited.
4. Every implementation area follows strict TDD:
   - first a RED checkpoint that adds a failing test suite
   - then a GREEN checkpoint that makes that exact suite pass
5. During each GREEN checkpoint, the test files introduced by the preceding RED checkpoint are off-limits.
6. Each checkpoint will be committed atomically with a Conventional Commit message.
7. Benchmarks and profiling can guide GREEN-phase implementation work, but they do not justify editing frozen tests or the frozen blueprint.

## Checkpoints

### Checkpoint 0

Commit shape: `docs(blueprint): define public API and rewrite blueprint`

Goal:

- Freeze the intended product before implementation starts.

Deliverables:

- `blueprint.md`
- every exported runtime API
- every exported TypeScript type
- score semantics
- empty-query and empty-target semantics
- canonical usage examples for each public entry point
- migration notes for intentionally dropped legacy behavior

Exit criteria:

- the blueprint is complete enough that later RED checkpoints can derive behavior from it without inventing API on the fly

### Checkpoint 1R

Commit shape: `test(core): specify single-target matching`

Goal:

- Lock down the first slice of user-visible behavior for single-target search.

Scope:

- exact match behavior
- subsequence match behavior
- no-match behavior
- result shape for a single match
- basic score ordering expectations

Exit criteria:

- the new suite fails against the current codebase

### Checkpoint 1G

Commit shape: `feat(core): implement single-target matching`

Goal:

- Implement the minimum single-target matcher required by Checkpoint 1R.

Scope:

- core matching engine
- public single-target API
- public result object for single-target search

Exit criteria:

- Checkpoint 1R tests pass without editing that suite

### Checkpoint 2R

Commit shape: `test(search): specify batch search and prepared targets`

Goal:

- Lock down batch search semantics and the first prepared-target behavior.

Scope:

- searching arrays of strings
- deterministic ranking order
- `limit`
- `threshold`
- `total`
- prepared target usage and immutability expectations

Exit criteria:

- the new suite fails against the current implementation

### Checkpoint 2G

Commit shape: `feat(search): implement batch search and preparation`

Goal:

- Add batch search and immutable prepared-target support.

Scope:

- array search
- top-N result selection
- prepared-target creation and reuse
- correct result container semantics

Exit criteria:

- Checkpoint 2R tests pass without editing that suite

### Checkpoint 3R

Commit shape: `test(rank): specify ranking boundaries and highlighting`

Goal:

- Freeze the quality-focused ranking behaviors that make the package useful.

Scope:

- boundary-aware ranking
- contiguous substring preference
- early-match preference
- highlight payload and formatting helpers
- canonical ranking fixtures from the blueprint

Exit criteria:

- the new suite fails against the current implementation

### Checkpoint 3G

Commit shape: `feat(rank): implement ranking metadata and highlighting`

Goal:

- Implement the ranking layer and result-highlighting support.

Scope:

- boundary metadata
- ranking heuristics
- match ranges or indexes
- public highlighting helpers

Exit criteria:

- Checkpoint 3R tests pass without editing that suite

### Checkpoint 4R

Commit shape: `test(tokens): specify tokenized query behavior`

Goal:

- Freeze the intended behavior for multi-token queries.

Scope:

- whitespace tokenization
- token coverage rules
- token ordering expectations
- phrase-like matching cases
- canonical multi-token examples from the blueprint

Exit criteria:

- the new suite fails against the current implementation

### Checkpoint 4G

Commit shape: `feat(tokens): implement tokenized query matching`

Goal:

- Add explicit token-aware matching and scoring.

Scope:

- query preprocessing
- token matching
- token aggregation
- phrase-like ranking behavior

Exit criteria:

- Checkpoint 4R tests pass without editing that suite

### Checkpoint 5R

Commit shape: `test(fields): specify object search APIs`

Goal:

- Freeze the object-search surface and multi-field behavior.

Scope:

- single-field search
- multi-field search
- field weighting or aggregation behavior, if the blueprint includes it
- object result shapes
- canonical object-search examples from the blueprint

Exit criteria:

- the new suite fails against the current implementation

### Checkpoint 5G

Commit shape: `feat(fields): implement object and multi-field search`

Goal:

- Implement the object-search APIs defined in the blueprint.

Scope:

- typed field access configuration
- single-field object search
- multi-field search
- aggregate object result ranking

Exit criteria:

- Checkpoint 5R tests pass without editing that suite

### Checkpoint 6R

Commit shape: `test(package): specify final package surface`

Goal:

- Freeze the release shape before packaging and documentation are finalized.

Scope:

- public exports
- generated type surface
- build-time API snapshot expectations
- README examples as executable or typechecked usage

Exit criteria:

- the new suite fails against the current implementation or current package surface

### Checkpoint 6G

Commit shape: `feat(package): finalize package surface and docs`

Goal:

- Finish the publishable package without changing the frozen blueprint or frozen test suites.

Scope:

- final exports
- final type declarations
- README usage examples
- migration documentation
- packaging cleanup needed for release

Exit criteria:

- Checkpoint 6R tests pass without editing that suite
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass

## Notes On Order

- The order is deliberate: API first, then core matching, then batch/prepared search, then ranking, then tokenized queries, then object search, then release surface.
- Object search is intentionally late because it depends on the core matcher, ranking model, token behavior, and result shapes being stable.
- Packaging is intentionally last so the build output reflects the final frozen API rather than a moving target.

## Pending Approval

Until you approve this plan:

- no `blueprint.md`
- no new tests
- no implementation code
- no checkpoint commits
