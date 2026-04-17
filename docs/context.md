# Overview

`fuzzysort2` is an in-memory fuzzy matcher for small and medium candidate sets where ranking quality matters more than substring-only recall. It is designed for command palettes, file pickers, symbol search, and record search where a query may be abbreviated, incomplete, or split across multiple terms.

# When to Use

- You need subsequence matching instead of exact or substring-only matching.
- You want ranking that prefers contiguous, early, and boundary-aligned matches.
- You want to search arrays of strings.
- You want to search records by one extracted field with `searchBy(...)`.
- You want different query tokens to match different named fields with `searchFields(...)`.
- You search the same target strings repeatedly and can benefit from `prepare(...)`.

# When Not to Use

- You need full-text indexing or large-dataset search.
- You need asynchronous, remote, or streaming search.
- You need language-aware stemming, tokenization, or relevance ranking beyond the built-in matching model.
- You want empty queries to return all candidates. `fuzzysort2` deliberately treats empty queries as no-match.

# Core Abstractions

- `match(query, target)`: match one query against one string or prepared target.
- `search(query, targets, options)`: rank an array of strings or prepared targets.
- `searchBy(query, values, extract, options)`: rank values through one extracted target string each.
- `searchFields(query, values, fields, options)`: rank values through multiple named text fields.
- `prepare(target)`: precompute immutable target metadata for reuse.
- `segments(match)` and `highlight(match, options)`: turn match ranges into display output.

# Data Flow / Lifecycle

1. The query is trimmed, split on whitespace, normalized, and deduplicated into tokens.
2. Targets are normalized for case-insensitive and Latin accent-insensitive matching.
3. Each token is matched as an ordered subsequence against one target or one field target.
4. The matcher ranks successful placements by contiguity, start position, boundary alignment, and target length.
5. Batch search applies threshold filtering, stable score ordering, and optional limit truncation.
6. The returned match ranges drive `segments(...)` and `highlight(...)`.

Prepared targets are caller-owned and immutable. There is no global cache lifecycle and no cleanup API.

# Common Tasks -> Recommended APIs

- Match one query against one string: `match(...)`
- Search a list of strings: `search(...)`
- Search one property on each record: `searchBy(...)`
- Search multiple named properties on each record: `searchFields(...)`
- Reuse expensive targets across many searches: `prepare(...)`
- Render matched and unmatched text segments separately: `segments(...)`
- Wrap matched text for UI output: `highlight(...)`

# Recommended Patterns

- Use `prepare(...)` when the same target strings are searched repeatedly.
- Keep `threshold` at `0` unless you are intentionally removing weak matches.
- Use `searchBy(...)` when one extracted text surface defines the result.
- Use `searchFields(...)` when different query tokens should be allowed to land on different fields.
- Use `segments(...)` when your UI needs full control over rendering rather than HTML strings.

# Patterns to Avoid

- Do not depend on empty queries returning all candidates.
- Do not construct `PreparedTarget` objects manually.
- Do not treat normalized scores as stable across internal scoring refactors beyond the documented ordering rules.
- Do not use `highlight(...)` directly with unescaped untrusted HTML.
- Do not use `searchFields(...)` when one field is the only meaningful source of truth for ranking; use `searchBy(...)` instead.

# Invariants and Constraints

- Empty queries return no matches across all search entry points.
- Empty targets never match non-empty queries.
- Repeated query tokens are deduplicated after normalization.
- Match ranges are sorted, non-overlapping, half-open, and merged when adjacent.
- Search results are sorted by descending score with input-order tie breaking.
- `total` is counted after threshold filtering and before limit truncation.
- `searchFields(...)` requires at least one field and unique non-empty field keys.

# Error Model

`fuzzysort2` does not perform general runtime type validation for shapes already covered by TypeScript.

Runtime validation is limited to semantic constraints:

- invalid `limit`
- invalid `threshold`
- empty `fields` in `searchFields(...)`
- empty field keys in `searchFields(...)`
- duplicate field keys in `searchFields(...)`

These cases throw `RangeError`.

# Terminology

- Query: the user-provided search string.
- Target: the string being matched.
- Prepared target: an opaque immutable value returned by `prepare(...)`.
- Token: one normalized query term after trimming, whitespace splitting, empty-token removal, and duplicate removal.
- Boundary: a preferred match start position at the beginning of a string, after separators, at lowercase-to-uppercase transitions, or at letter-digit and digit-letter transitions.
- Range: a half-open character span on the original target string.
- Field: one named extracted target string used by `searchFields(...)`.

# Non-Goals

- Backward compatibility with `fuzzysort` v3 result shapes and helper methods.
- Global caches or cleanup hooks.
- User-provided scoring callbacks.
- Async search or indexed search.
- A large guide tree or tutorial-heavy documentation set.
