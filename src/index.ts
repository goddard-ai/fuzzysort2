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

const PREPARED_TARGET = Symbol('prepared-target')
const EPSILON = 1e-9

type InternalPreparedTarget = PreparedTarget & {
  readonly [PREPARED_TARGET]: true
  readonly normalized: string
  readonly boundaries: readonly boolean[]
}

type Placement = {
  readonly indices: readonly number[]
  readonly ranges: readonly MatchRange[]
  readonly score: number
}

export function prepare(_target: string): PreparedTarget {
  return createPreparedTarget(_target)
}

export function match(query: string, target: string | PreparedTarget): Match | null {
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    return null
  }

  const prepared = getPreparedTarget(target)
  if (prepared.normalized.length === 0) {
    return null
  }

  if (tokens.length === 1) {
    return matchSingleToken(tokens[0], prepared)
  }

  const tokenMatches: Match[] = []
  for (const token of tokens) {
    const result = matchSingleToken(token, prepared)
    if (result === null) {
      return null
    }
    tokenMatches.push(result)
  }

  const aggregated = aggregateTokenMatches(tokenMatches)
  const coherent = matchSingleToken(tokens.join(''), prepared)

  if (coherent !== null && coherent.score > aggregated.score) {
    return coherent
  }

  return aggregated
}

export function search(
  query: string,
  targets: readonly (string | PreparedTarget)[],
  options?: SearchOptions,
): SearchResult<Match> {
  const limit = resolveLimit(options?.limit)
  const threshold = resolveThreshold(options?.threshold)

  if (tokenize(query).length === 0) {
    return { items: [], total: 0 }
  }

  const ranked: Array<{ readonly index: number; readonly match: Match }> = []
  for (let index = 0; index < targets.length; index += 1) {
    const result = match(query, targets[index])
    if (result === null || result.score < threshold) {
      continue
    }
    ranked.push({ index, match: result })
  }

  ranked.sort((left, right) => {
    const scoreDifference = right.match.score - left.match.score
    if (Math.abs(scoreDifference) > EPSILON) {
      return scoreDifference
    }
    return left.index - right.index
  })

  const total = ranked.length
  const items = limit === undefined
    ? ranked.map(entry => entry.match)
    : ranked.slice(0, limit).map(entry => entry.match)

  return { items, total }
}

export function searchBy<T>(
  query: string,
  values: readonly T[],
  extract: (value: T) => string | PreparedTarget | null | undefined,
  options?: SearchOptions,
): SearchResult<ValueMatch<T>> {
  const limit = resolveLimit(options?.limit)
  const threshold = resolveThreshold(options?.threshold)
  if (tokenize(query).length === 0) {
    return { items: [], total: 0 }
  }

  const ranked: Array<{ readonly index: number; readonly match: ValueMatch<T> }> = []
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const target = extract(value)
    if (target == null) {
      continue
    }

    const result = match(query, target)
    if (result === null || result.score < threshold) {
      continue
    }

    ranked.push({
      index,
      match: {
        value,
        target: result.target,
        score: result.score,
        ranges: result.ranges,
      },
    })
  }

  return finalizeSearchResult(ranked, limit)
}

export function searchFields<T>(
  query: string,
  values: readonly T[],
  fields: readonly FieldDefinition<T>[],
  options?: SearchOptions,
): SearchResult<RecordMatch<T>> {
  if (fields.length === 0) {
    throw new RangeError('fields must not be empty')
  }

  const keys = new Set<string>()
  for (const field of fields) {
    if (field.key === '') {
      throw new RangeError('field keys must not be empty')
    }
    if (keys.has(field.key)) {
      throw new RangeError('field keys must be unique')
    }
    keys.add(field.key)
  }

  const limit = resolveLimit(options?.limit)
  const threshold = resolveThreshold(options?.threshold)
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    return { items: [], total: 0 }
  }

  const ranked: Array<{ readonly index: number; readonly match: RecordMatch<T> }> = []

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const extracted = fields.map(field => ({
      key: field.key,
      target: field.extract(value),
    }))

    const candidates = tokens.map(token => {
      const tokenCandidates: Array<{ readonly fieldIndex: number; readonly match: Match }> = []
      for (let fieldIndex = 0; fieldIndex < extracted.length; fieldIndex += 1) {
        const target = extracted[fieldIndex]?.target
        if (target == null) {
          continue
        }

        const result = match(token, target)
        if (result !== null) {
          tokenCandidates.push({ fieldIndex, match: result })
        }
      }
      return tokenCandidates
    })

    if (candidates.some(candidate => candidate.length === 0)) {
      continue
    }

    const assignment = chooseFieldAssignment(candidates)
    if (assignment === null) {
      continue
    }

    const fieldMatches = buildFieldMatches(assignment, extracted)
    const score = averageScore(assignment.map(entry => entry.match))
    if (score < threshold) {
      continue
    }

    ranked.push({
      index,
      match: {
        value,
        score,
        fields: fieldMatches,
      },
    })
  }

  return finalizeSearchResult(ranked, limit)
}

export function segments(_match: HighlightableMatch): readonly MatchSegment[] {
  const parts: MatchSegment[] = []
  let cursor = 0

  for (const range of _match.ranges) {
    if (range.start > cursor) {
      parts.push({ text: _match.target.slice(cursor, range.start), matched: false })
    }

    parts.push({ text: _match.target.slice(range.start, range.end), matched: true })
    cursor = range.end
  }

  if (cursor < _match.target.length) {
    parts.push({ text: _match.target.slice(cursor), matched: false })
  }

  return parts
}

export function highlight(
  _match: HighlightableMatch,
  _options?: { open?: string; close?: string },
): string {
  const open = _options?.open ?? '<mark>'
  const close = _options?.close ?? '</mark>'

  return segments(_match).map(part => {
    if (!part.matched) {
      return part.text
    }
    return `${open}${part.text}${close}`
  }).join('')
}

function getPreparedTarget(target: string | PreparedTarget): InternalPreparedTarget {
  if (typeof target === 'string') {
    return createPreparedTarget(target)
  }

  const prepared = target as InternalPreparedTarget
  if (prepared[PREPARED_TARGET] === true) {
    return prepared
  }

  return createPreparedTarget(prepared.target)
}

function createPreparedTarget(target: string): InternalPreparedTarget {
  return Object.freeze({
    target,
    [PREPARED_TARGET]: true as const,
    normalized: normalizeText(target),
    boundaries: computeBoundaries(target),
  })
}

function tokenize(query: string): string[] {
  const trimmed = query.trim()
  if (trimmed === '') {
    return []
  }

  const tokens: string[] = []
  const seen = new Set<string>()
  for (const token of trimmed.split(/\s+/)) {
    const normalized = normalizeText(token)
    if (normalized === '' || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    tokens.push(normalized)
  }
  return tokens
}

function matchSingleToken(query: string, prepared: InternalPreparedTarget): Match | null {
  if (query === prepared.normalized) {
    return {
      target: prepared.target,
      score: 1,
      ranges: [{ start: 0, end: prepared.target.length }],
    }
  }

  const placement = findBestPlacement(query, prepared)
  if (placement === null) {
    return null
  }

  return {
    target: prepared.target,
    score: placement.score,
    ranges: placement.ranges,
  }
}

function normalizeText(text: string): string {
  return removeAccents(text).toLowerCase()
}

function removeAccents(text: string): string {
  return text.replace(/\p{Script=Latin}+/gu, part => part.normalize('NFD')).replace(/[\u0300-\u036f]/g, '')
}

function computeBoundaries(target: string): boolean[] {
  const boundaries = new Array<boolean>(target.length).fill(false)
  if (target.length === 0) {
    return boundaries
  }

  boundaries[0] = true

  for (let index = 1; index < target.length; index += 1) {
    const previous = target[index - 1]
    const current = target[index]

    const previousIsAlphaNumeric = isAlphaNumeric(previous)
    const currentIsAlphaNumeric = isAlphaNumeric(current)

    if (!previousIsAlphaNumeric && currentIsAlphaNumeric) {
      boundaries[index] = true
      continue
    }

    if (isLowercaseLetter(previous) && isUppercaseLetter(current)) {
      boundaries[index] = true
      continue
    }

    if (isLetter(previous) && isDigit(current)) {
      boundaries[index] = true
      continue
    }

    if (isDigit(previous) && isLetter(current)) {
      boundaries[index] = true
    }
  }

  return boundaries
}

function isAlphaNumeric(char: string): boolean {
  return isLetter(char) || isDigit(char)
}

function isLetter(char: string): boolean {
  const code = char.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isDigit(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= 48 && code <= 57
}

function isLowercaseLetter(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= 97 && code <= 122
}

function isUppercaseLetter(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= 65 && code <= 90
}

function findBestPlacement(query: string, prepared: InternalPreparedTarget): Placement | null {
  const positionsByChar = new Map<string, number[]>()
  for (let index = 0; index < prepared.normalized.length; index += 1) {
    const char = prepared.normalized[index]
    const positions = positionsByChar.get(char)
    if (positions) {
      positions.push(index)
    } else {
      positionsByChar.set(char, [index])
    }
  }

  let best: Placement | null = null
  const chosen: number[] = []

  const visit = (queryIndex: number, minimumTargetIndex: number): void => {
    if (queryIndex === query.length) {
      const indices = chosen.slice()
      const ranges = buildRanges(indices)
      const score = scorePlacement(indices, ranges, prepared.boundaries, prepared.target.length)
      const placement: Placement = { indices, ranges, score }

      if (best === null || comparePlacements(placement, best, prepared.boundaries, prepared.target.length) > 0) {
        best = placement
      }
      return
    }

    const positions = positionsByChar.get(query[queryIndex])
    if (!positions) {
      return
    }

    const startAt = lowerBound(positions, minimumTargetIndex)
    for (let index = startAt; index < positions.length; index += 1) {
      chosen.push(positions[index])
      visit(queryIndex + 1, positions[index] + 1)
      chosen.pop()
    }
  }

  visit(0, 0)
  return best
}

function lowerBound(values: readonly number[], minimum: number): number {
  let low = 0
  let high = values.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (values[middle] < minimum) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low
}

function buildRanges(indices: readonly number[]): MatchRange[] {
  if (indices.length === 0) {
    return []
  }

  const ranges: MatchRange[] = []
  let start = indices[0]
  let end = start + 1

  for (let index = 1; index < indices.length; index += 1) {
    const current = indices[index]
    if (current === end) {
      end += 1
      continue
    }

    ranges.push({ start, end })
    start = current
    end = current + 1
  }

  ranges.push({ start, end })
  return ranges
}

function mergeRanges(ranges: readonly MatchRange[]): MatchRange[] {
  if (ranges.length === 0) {
    return []
  }

  const sorted = [...ranges].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start
    }
    return left.end - right.end
  })

  const merged: MatchRange[] = []
  let start = sorted[0].start
  let end = sorted[0].end

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    if (current.start <= end) {
      end = Math.max(end, current.end)
      continue
    }

    merged.push({ start, end })
    start = current.start
    end = current.end
  }

  merged.push({ start, end })
  return merged
}

function scorePlacement(
  indices: readonly number[],
  ranges: readonly MatchRange[],
  boundaries: readonly boolean[],
  targetLength: number,
): number {
  const penalty = placementPenalty(indices, ranges, boundaries, targetLength)
  return 1 / (1 + penalty / 100)
}

function comparePlacements(
  left: Placement,
  right: Placement,
  boundaries: readonly boolean[],
  targetLength: number,
): number {
  if (Math.abs(left.score - right.score) > EPSILON) {
    return left.score > right.score ? 1 : -1
  }

  const leftMetrics = placementMetrics(left.indices, left.ranges, boundaries, targetLength)
  const rightMetrics = placementMetrics(right.indices, right.ranges, boundaries, targetLength)

  if (leftMetrics.start !== rightMetrics.start) {
    return leftMetrics.start < rightMetrics.start ? 1 : -1
  }

  if (leftMetrics.rangeCount !== rightMetrics.rangeCount) {
    return leftMetrics.rangeCount < rightMetrics.rangeCount ? 1 : -1
  }

  if (leftMetrics.coveredSpan !== rightMetrics.coveredSpan) {
    return leftMetrics.coveredSpan < rightMetrics.coveredSpan ? 1 : -1
  }

  if (leftMetrics.boundaryCount !== rightMetrics.boundaryCount) {
    return leftMetrics.boundaryCount > rightMetrics.boundaryCount ? 1 : -1
  }

  return 0
}

function placementMetrics(
  indices: readonly number[],
  ranges: readonly MatchRange[],
  boundaries: readonly boolean[],
  _targetLength: number,
) {
  let boundaryCount = 0
  for (const index of indices) {
    if (boundaries[index]) {
      boundaryCount += 1
    }
  }

  return {
    start: indices[0],
    rangeCount: ranges.length,
    coveredSpan: indices[indices.length - 1] - indices[0] + 1,
    boundaryCount,
  }
}

function aggregateTokenMatches(matches: readonly Match[]): Match {
  const ranges = mergeRanges(matches.flatMap(match => match.ranges))

  let scoreTotal = 0
  for (const match of matches) {
    scoreTotal += match.score
  }

  let score = scoreTotal / matches.length
  let previousStart = -1
  let previousEnd = -1

  for (const match of matches) {
    const start = match.ranges[0]?.start ?? 0
    const end = match.ranges[match.ranges.length - 1]?.end ?? start
    if (previousStart >= 0 && start < previousStart) {
      score *= 0.5
    }
    if (previousEnd >= 0 && start < previousEnd) {
      score *= 0.75
    }
    previousStart = start
    previousEnd = end
  }

  return {
    target: matches[0].target,
    score,
    ranges,
  }
}

function placementPenalty(
  indices: readonly number[],
  ranges: readonly MatchRange[],
  boundaries: readonly boolean[],
  targetLength: number,
): number {
  let boundaryCount = 0
  for (const index of indices) {
    if (boundaries[index]) {
      boundaryCount += 1
    }
  }

  const start = indices[0]
  const coveredSpan = indices[indices.length - 1] - start + 1
  const nonBoundaryCount = indices.length - boundaryCount

  let penalty = 0
  penalty += start * 100
  penalty += (ranges.length - 1) * 100
  penalty += nonBoundaryCount * 10
  penalty += coveredSpan
  penalty += targetLength * 0.01

  return penalty
}

function finalizeSearchResult<TMatch extends { readonly score: number }>(
  ranked: ReadonlyArray<{ readonly index: number; readonly match: TMatch }>,
  limit: number | undefined,
): SearchResult<TMatch> {
  const ordered = [...ranked].sort((left, right) => {
    const scoreDifference = right.match.score - left.match.score
    if (Math.abs(scoreDifference) > EPSILON) {
      return scoreDifference
    }
    return left.index - right.index
  })

  const total = ordered.length
  const items = limit === undefined
    ? ordered.map(entry => entry.match)
    : ordered.slice(0, limit).map(entry => entry.match)

  return { items, total }
}

function chooseFieldAssignment(
  candidates: readonly (readonly { readonly fieldIndex: number; readonly match: Match }[])[],
): ReadonlyArray<{ readonly fieldIndex: number; readonly match: Match }> | null {
  let best: Array<{ readonly fieldIndex: number; readonly match: Match }> | null = null

  const visit = (
    tokenIndex: number,
    chosen: Array<{ readonly fieldIndex: number; readonly match: Match }>,
  ): void => {
    if (tokenIndex === candidates.length) {
      if (best === null || compareAssignments(chosen, best) > 0) {
        best = chosen.slice()
      }
      return
    }

    for (const candidate of candidates[tokenIndex]!) {
      chosen.push(candidate)
      visit(tokenIndex + 1, chosen)
      chosen.pop()
    }
  }

  visit(0, [])
  return best
}

function compareAssignments(
  left: readonly { readonly fieldIndex: number; readonly match: Match }[],
  right: readonly { readonly fieldIndex: number; readonly match: Match }[],
): number {
  const leftScore = averageScore(left.map(entry => entry.match))
  const rightScore = averageScore(right.map(entry => entry.match))
  if (Math.abs(leftScore - rightScore) > EPSILON) {
    return leftScore > rightScore ? 1 : -1
  }

  const leftFieldCount = new Set(left.map(entry => entry.fieldIndex)).size
  const rightFieldCount = new Set(right.map(entry => entry.fieldIndex)).size
  if (leftFieldCount !== rightFieldCount) {
    return leftFieldCount < rightFieldCount ? 1 : -1
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]!.fieldIndex !== right[index]!.fieldIndex) {
      return left[index]!.fieldIndex < right[index]!.fieldIndex ? 1 : -1
    }
  }

  return 0
}

function buildFieldMatches<T>(
  assignment: readonly { readonly fieldIndex: number; readonly match: Match }[],
  extracted: readonly { readonly key: string; readonly target: string | PreparedTarget | null | undefined }[],
): FieldMatch[] {
  const byField = new Map<number, Match[]>()

  for (const entry of assignment) {
    const matches = byField.get(entry.fieldIndex)
    if (matches) {
      matches.push(entry.match)
    } else {
      byField.set(entry.fieldIndex, [entry.match])
    }
  }

  const fieldMatches: FieldMatch[] = []
  for (let fieldIndex = 0; fieldIndex < extracted.length; fieldIndex += 1) {
    const matches = byField.get(fieldIndex)
    if (!matches || matches.length === 0) {
      continue
    }

    const target = matches[0]!.target
    fieldMatches.push({
      key: extracted[fieldIndex]!.key,
      target,
      ranges: mergeRanges(matches.flatMap(match => match.ranges)),
      score: averageScore(matches),
    })
  }

  return fieldMatches
}

function averageScore(matches: readonly { readonly score: number }[]): number {
  let total = 0
  for (const match of matches) {
    total += match.score
  }
  return total / matches.length
}

function resolveLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError('limit must be an integer greater than or equal to 0')
  }
  return limit
}

function resolveThreshold(threshold: number | undefined): number {
  if (threshold === undefined) {
    return 0
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('threshold must be a finite number between 0 and 1')
  }
  return threshold
}
