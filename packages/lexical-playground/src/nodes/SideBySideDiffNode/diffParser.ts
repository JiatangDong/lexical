/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * A self-contained unified-diff parser used by {@link SideBySideDiffNode}.
 *
 * It turns a unified diff string (the output of `diff -u` / `git diff`) into a
 * list of aligned rows that a side-by-side renderer can consume directly. No
 * external diff libraries are used: hunk parsing, removed/added line pairing and
 * intra-line (word level) highlighting are all implemented here.
 */

/**
 * A contiguous piece of a line, tagged with how it differs from the paired line
 * on the other side. `equal` segments appear on both sides; `removed` segments
 * only appear on the left (old) side and `added` segments only on the right
 * (new) side.
 */
export type DiffSegmentType = 'equal' | 'removed' | 'added';

export interface DiffSegment {
  type: DiffSegmentType;
  value: string;
}

/**
 * One side (left = old, right = new) of an aligned row. `lineNumber` is null for
 * a "phantom" cell that exists only to keep the two columns aligned (e.g. the
 * right cell of a pure deletion).
 */
export interface DiffCell {
  lineNumber: number | null;
  content: string;
  segments: Array<DiffSegment>;
}

export type DiffRowType =
  // Both sides identical (context line).
  | 'unchanged'
  // Both sides present but with intra-line differences.
  | 'modified'
  // Left side only (deletion).
  | 'removed'
  // Right side only (insertion).
  | 'added'
  // A `@@ ... @@` hunk header — spans the full width.
  | 'hunk';

export interface DiffRow {
  type: DiffRowType;
  left: DiffCell | null;
  right: DiffCell | null;
  /** Present for `hunk` rows: the raw header text. */
  header?: string;
}

const HUNK_HEADER_REGEXP = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

function emptyCell(): DiffCell {
  return {content: '', lineNumber: null, segments: []};
}

/**
 * Lines that are part of the diff metadata rather than the content. These are
 * skipped so that a full `git diff` (with `diff --git`, `index`, `---`/`+++`
 * file headers) renders the same as a bare hunk body.
 */
function isMetadataLine(line: string): boolean {
  return (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('old mode ') ||
    line.startsWith('new mode ') ||
    line.startsWith('similarity ') ||
    line.startsWith('rename ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('\\ No newline')
  );
}

/**
 * Pair a run of removed lines with a run of added lines. Lines are paired by
 * position: the i-th removed line is shown opposite the i-th added line as a
 * `modified` row (with intra-line highlighting). Any surplus removed lines
 * become `removed` rows and surplus added lines become `added` rows.
 */
function flushChangeBlock(
  removed: Array<DiffCell>,
  added: Array<DiffCell>,
  rows: Array<DiffRow>,
): void {
  const pairCount = Math.min(removed.length, added.length);
  for (let i = 0; i < pairCount; i++) {
    const left = removed[i];
    const right = added[i];
    const [leftSegments, rightSegments] = diffWords(
      left.content,
      right.content,
    );
    left.segments = leftSegments;
    right.segments = rightSegments;
    rows.push({left, right, type: 'modified'});
  }
  for (let i = pairCount; i < removed.length; i++) {
    rows.push({left: removed[i], right: emptyCell(), type: 'removed'});
  }
  for (let i = pairCount; i < added.length; i++) {
    rows.push({left: emptyCell(), right: added[i], type: 'added'});
  }
  removed.length = 0;
  added.length = 0;
}

/**
 * Parse a unified diff string into aligned rows for side-by-side rendering.
 *
 * When the input does not contain any hunk headers it is treated as a bare hunk
 * body (lines prefixed with ` `, `+`, `-`) so simple snippets render too.
 */
export function parseUnifiedDiff(diff: string): Array<DiffRow> {
  const lines = diff.replace(/\n$/, '').split('\n');
  const rows: Array<DiffRow> = [];
  const removed: Array<DiffCell> = [];
  const added: Array<DiffCell> = [];

  // 1-based line counters, updated by hunk headers and incremented per line.
  let oldLine = 1;
  let newLine = 1;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_REGEXP);
    if (hunkMatch) {
      flushChangeBlock(removed, added, rows);
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[2]);
      rows.push({
        header: line,
        left: null,
        right: null,
        type: 'hunk',
      });
      continue;
    }

    if (isMetadataLine(line)) {
      continue;
    }

    // Inside a hunk every content line is prefixed with a marker. Before the
    // first hunk header (bare body) we apply the same rules but tolerate lines
    // with no prefix by treating them as context.
    const marker = line[0];
    const content = line.length > 0 ? line.slice(1) : '';

    if (marker === '-') {
      removed.push({content, lineNumber: oldLine, segments: []});
      oldLine++;
    } else if (marker === '+') {
      added.push({content, lineNumber: newLine, segments: []});
      newLine++;
    } else if (marker === ' ' || marker === undefined) {
      flushChangeBlock(removed, added, rows);
      const ctx = marker === undefined ? '' : content;
      rows.push({
        left: {content: ctx, lineNumber: oldLine, segments: []},
        right: {content: ctx, lineNumber: newLine, segments: []},
        type: 'unchanged',
      });
      oldLine++;
      newLine++;
    } else {
      // Unknown prefix (e.g. a bare line in a body without leading space):
      // treat the whole line as context to avoid dropping content.
      flushChangeBlock(removed, added, rows);
      rows.push({
        left: {content: line, lineNumber: oldLine, segments: []},
        right: {content: line, lineNumber: newLine, segments: []},
        type: 'unchanged',
      });
      oldLine++;
      newLine++;
    }
  }
  flushChangeBlock(removed, added, rows);

  return rows;
}

/**
 * Split a line into word-ish tokens for intra-line diffing: runs of word
 * characters, runs of whitespace, and individual punctuation characters are
 * each their own token. This produces natural word-level highlighting rather
 * than character noise.
 */
function tokenize(value: string): Array<string> {
  return value.match(/(\w+|\s+|[^\w\s])/g) ?? [];
}

/**
 * Compute a word-level diff between two strings using a longest-common-
 * subsequence table. Returns a `[leftSegments, rightSegments]` tuple where the
 * left segments contain `equal`/`removed` pieces and the right segments contain
 * `equal`/`added` pieces. Adjacent segments of the same type are coalesced.
 */
export function diffWords(
  oldValue: string,
  newValue: string,
): [Array<DiffSegment>, Array<DiffSegment>] {
  const oldTokens = tokenize(oldValue);
  const newTokens = tokenize(newValue);
  const n = oldTokens.length;
  const m = newTokens.length;

  // lcs[i][j] = length of LCS of oldTokens[i:] and newTokens[j:].
  const lcs: Array<Array<number>> = Array.from({length: n + 1}, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldTokens[i] === newTokens[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  const left: Array<DiffSegment> = [];
  const right: Array<DiffSegment> = [];
  const pushSegment = (
    segments: Array<DiffSegment>,
    type: DiffSegmentType,
    value: string,
  ) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.value += value;
    } else {
      segments.push({type, value});
    }
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i] === newTokens[j]) {
      pushSegment(left, 'equal', oldTokens[i]);
      pushSegment(right, 'equal', newTokens[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      pushSegment(left, 'removed', oldTokens[i]);
      i++;
    } else {
      pushSegment(right, 'added', newTokens[j]);
      j++;
    }
  }
  while (i < n) {
    pushSegment(left, 'removed', oldTokens[i]);
    i++;
  }
  while (j < m) {
    pushSegment(right, 'added', newTokens[j]);
    j++;
  }

  return [left, right];
}
