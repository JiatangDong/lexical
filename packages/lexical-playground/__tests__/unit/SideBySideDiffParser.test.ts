/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {describe, expect, it} from 'vitest';

import {
  diffWords,
  parseUnifiedDiff,
} from '../../src/nodes/SideBySideDiffNode/diffParser';

describe('parseUnifiedDiff', () => {
  it('parses context lines into aligned unchanged rows', () => {
    const rows = parseUnifiedDiff(['@@ -1,2 +1,2 @@', ' a', ' b'].join('\n'));
    expect(rows).toHaveLength(3);
    expect(rows[0].type).toBe('hunk');
    expect(rows[1].type).toBe('unchanged');
    expect(rows[1].left).toEqual({content: 'a', lineNumber: 1, segments: []});
    expect(rows[1].right).toEqual({content: 'a', lineNumber: 1, segments: []});
    expect(rows[2].left?.lineNumber).toBe(2);
    expect(rows[2].right?.lineNumber).toBe(2);
  });

  it('pairs a removed line with an added line as a modified row', () => {
    const rows = parseUnifiedDiff(
      ['@@ -1,1 +1,1 @@', '-hello world', '+hello there'].join('\n'),
    );
    expect(rows).toHaveLength(2);
    const modified = rows[1];
    expect(modified.type).toBe('modified');
    expect(modified.left?.content).toBe('hello world');
    expect(modified.right?.content).toBe('hello there');
    // Intra-line segments should be computed for paired rows.
    expect(modified.left?.segments.some(s => s.type === 'removed')).toBe(true);
    expect(modified.right?.segments.some(s => s.type === 'added')).toBe(true);
  });

  it('emits a pure deletion with a phantom right cell', () => {
    const rows = parseUnifiedDiff(
      ['@@ -1,2 +1,1 @@', ' keep', '-gone'].join('\n'),
    );
    const removed = rows[2];
    expect(removed.type).toBe('removed');
    expect(removed.left?.content).toBe('gone');
    expect(removed.right?.lineNumber).toBeNull();
    expect(removed.right?.content).toBe('');
  });

  it('emits a pure insertion with a phantom left cell', () => {
    const rows = parseUnifiedDiff(
      ['@@ -1,1 +1,2 @@', ' keep', '+added'].join('\n'),
    );
    const added = rows[2];
    expect(added.type).toBe('added');
    expect(added.right?.content).toBe('added');
    expect(added.left?.lineNumber).toBeNull();
  });

  it('tracks line numbers from the hunk header', () => {
    const rows = parseUnifiedDiff(
      ['@@ -10,2 +20,2 @@', ' x', '-y', '+z'].join('\n'),
    );
    const context = rows[1];
    expect(context.left?.lineNumber).toBe(10);
    expect(context.right?.lineNumber).toBe(20);
    const modified = rows[2];
    expect(modified.left?.lineNumber).toBe(11);
    expect(modified.right?.lineNumber).toBe(21);
  });

  it('skips git metadata lines (diff --git, index, ---, +++)', () => {
    const rows = parseUnifiedDiff(
      [
        'diff --git a/f.js b/f.js',
        'index 111..222 100644',
        '--- a/f.js',
        '+++ b/f.js',
        '@@ -1,1 +1,1 @@',
        '-old',
        '+new',
      ].join('\n'),
    );
    // Only the hunk header + the modified row should remain.
    expect(rows.map(r => r.type)).toEqual(['hunk', 'modified']);
  });

  it('handles multiple added lines opposite fewer removed lines', () => {
    const rows = parseUnifiedDiff(
      ['@@ -1,1 +1,3 @@', '-one', '+one', '+two', '+three'].join('\n'),
    );
    const types = rows.slice(1).map(r => r.type);
    expect(types).toEqual(['modified', 'added', 'added']);
  });
});

describe('diffWords', () => {
  it('marks differing words on each side', () => {
    const [left, right] = diffWords('the quick fox', 'the slow fox');
    expect(left.filter(s => s.type === 'removed').map(s => s.value)).toEqual([
      'quick',
    ]);
    expect(right.filter(s => s.type === 'added').map(s => s.value)).toEqual([
      'slow',
    ]);
    // Shared words are preserved as equal segments on both sides.
    expect(
      left
        .filter(s => s.type === 'equal')
        .map(s => s.value)
        .join(''),
    ).toBe('the  fox');
  });

  it('reconstructs the original strings from the segments', () => {
    const oldValue = 'return "Hello, " + name;';
    const newValue = 'return `Hello, ${name}!`;';
    const [left, right] = diffWords(oldValue, newValue);
    expect(
      left
        .filter(s => s.type !== 'added')
        .map(s => s.value)
        .join(''),
    ).toBe(oldValue);
    expect(
      right
        .filter(s => s.type !== 'removed')
        .map(s => s.value)
        .join(''),
    ).toBe(newValue);
  });

  it('returns only equal segments for identical strings', () => {
    const [left, right] = diffWords('same', 'same');
    expect(left).toEqual([{type: 'equal', value: 'same'}]);
    expect(right).toEqual([{type: 'equal', value: 'same'}]);
  });
});
