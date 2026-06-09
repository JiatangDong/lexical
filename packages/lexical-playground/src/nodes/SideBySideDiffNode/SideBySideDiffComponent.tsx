/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {ElementFormatType, NodeKey} from 'lexical';
import type {JSX} from 'react';

import './SideBySideDiffNode.css';

import {BlockWithAlignableContents} from '@lexical/react/LexicalBlockWithAlignableContents';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$getNodeByKey} from 'lexical';
import * as React from 'react';
import {useMemo, useRef, useState} from 'react';

import {DiffCell, DiffRow, parseUnifiedDiff} from './diffParser';
import {$isSideBySideDiffNode, DiffViewMode} from './SideBySideDiffNode';

// How many unchanged context lines to keep visible on each side of a change
// before collapsing the rest of an unchanged run.
const CONTEXT_LINES = 3;

type Side = 'left' | 'right';

type RenderItem =
  | {kind: 'row'; row: DiffRow; key: string}
  | {kind: 'collapsed'; id: string; rows: Array<DiffRow>; key: string};

/**
 * Group the flat row list into render items, collapsing long runs of unchanged
 * lines into a single expandable band while keeping {@link CONTEXT_LINES} lines
 * of context next to any change.
 */
function buildRenderItems(rows: Array<DiffRow>): Array<RenderItem> {
  const items: Array<RenderItem> = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.type !== 'unchanged') {
      items.push({key: `r${i}`, kind: 'row', row});
      i++;
      continue;
    }
    // Collect the full run of consecutive unchanged rows.
    let j = i;
    while (j < rows.length && rows[j].type === 'unchanged') {
      j++;
    }
    const run = rows.slice(i, j);
    const hasChangeBefore = i > 0;
    const hasChangeAfter = j < rows.length;
    const topKeep = hasChangeBefore ? CONTEXT_LINES : 0;
    const bottomKeep = hasChangeAfter ? CONTEXT_LINES : 0;

    if (run.length > topKeep + bottomKeep + 1) {
      for (let k = 0; k < topKeep; k++) {
        items.push({key: `r${i + k}`, kind: 'row', row: run[k]});
      }
      const hidden = run.slice(topKeep, run.length - bottomKeep);
      items.push({id: `c${i}`, key: `c${i}`, kind: 'collapsed', rows: hidden});
      for (let k = run.length - bottomKeep; k < run.length; k++) {
        items.push({key: `r${i + k}`, kind: 'row', row: run[k]});
      }
    } else {
      for (let k = 0; k < run.length; k++) {
        items.push({key: `r${i + k}`, kind: 'row', row: run[k]});
      }
    }
    i = j;
  }
  return items;
}

function CellContent({cell}: {cell: DiffCell | null}): JSX.Element {
  if (cell === null) {
    return <span className="SideBySideDiff__content" />;
  }
  if (cell.segments.length === 0) {
    return (
      <span className="SideBySideDiff__content">{cell.content || ' '}</span>
    );
  }
  return (
    <span className="SideBySideDiff__content">
      {cell.segments.map((segment, index) => (
        <span
          className={`SideBySideDiff__seg SideBySideDiff__seg--${segment.type}`}
          key={index}>
          {segment.value}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Split (side-by-side) view
// ---------------------------------------------------------------------------

function gutterFor(side: Side, row: DiffRow): number | null {
  const cell = side === 'left' ? row.left : row.right;
  return cell ? cell.lineNumber : null;
}

function rowClassName(side: Side, row: DiffRow): string {
  const cell = side === 'left' ? row.left : row.right;
  const base = 'SideBySideDiff__line';
  if (row.type === 'hunk') {
    return `${base} SideBySideDiff__line--hunk`;
  }
  if (cell === null || (cell.lineNumber === null && cell.content === '')) {
    // Phantom cell that exists only for alignment.
    if (
      (side === 'left' && row.type === 'added') ||
      (side === 'right' && row.type === 'removed')
    ) {
      return `${base} SideBySideDiff__line--empty`;
    }
  }
  if (row.type === 'removed') {
    return `${base} SideBySideDiff__line--removed`;
  }
  if (row.type === 'added') {
    return `${base} SideBySideDiff__line--added`;
  }
  if (row.type === 'modified') {
    return side === 'left'
      ? `${base} SideBySideDiff__line--removed`
      : `${base} SideBySideDiff__line--added`;
  }
  return base;
}

function CollapsedBand({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div
      className="SideBySideDiff__line SideBySideDiff__line--collapsed"
      onClick={onToggle}
      role="button"
      tabIndex={0}>
      <span className="SideBySideDiff__gutter" />
      <span className="SideBySideDiff__content">
        {expanded
          ? '⋯ Hide unchanged lines'
          : `⋯ Show ${count} unchanged line${count === 1 ? '' : 's'}`}
      </span>
    </div>
  );
}

function Panel({
  side,
  items,
  expanded,
  onToggle,
  panelRef,
  onScroll,
}: {
  side: Side;
  items: Array<RenderItem>;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}): JSX.Element {
  return (
    <div
      className={`SideBySideDiff__panel SideBySideDiff__panel--${side}`}
      onScroll={onScroll}
      ref={panelRef}>
      {items.map(item => {
        if (item.kind === 'collapsed') {
          const isOpen = expanded.has(item.id);
          return (
            <React.Fragment key={item.key}>
              <CollapsedBand
                count={item.rows.length}
                expanded={isOpen}
                onToggle={() => onToggle(item.id)}
              />
              {isOpen &&
                item.rows.map((row, k) => (
                  <DiffLine key={`${item.key}-${k}`} row={row} side={side} />
                ))}
            </React.Fragment>
          );
        }
        return <DiffLine key={item.key} row={item.row} side={side} />;
      })}
    </div>
  );
}

function DiffLine({row, side}: {row: DiffRow; side: Side}): JSX.Element {
  if (row.type === 'hunk') {
    return (
      <div className="SideBySideDiff__line SideBySideDiff__line--hunk">
        <span className="SideBySideDiff__gutter" />
        <span className="SideBySideDiff__content">{row.header}</span>
      </div>
    );
  }
  const cell = side === 'left' ? row.left : row.right;
  const gutter = gutterFor(side, row);
  return (
    <div className={rowClassName(side, row)}>
      <span className="SideBySideDiff__gutter">{gutter ?? ''}</span>
      <CellContent cell={cell} />
    </div>
  );
}

function SplitView({
  items,
  expanded,
  onToggle,
}: {
  items: Array<RenderItem>;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
}): JSX.Element {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  // Guards against the scroll-sync feedback loop (programmatic scroll of one
  // panel would otherwise re-trigger the other panel's scroll handler).
  const isSyncing = useRef(false);

  const syncScroll = (from: Side) => {
    if (isSyncing.current) {
      isSyncing.current = false;
      return;
    }
    const source = from === 'left' ? leftRef.current : rightRef.current;
    const target = from === 'left' ? rightRef.current : leftRef.current;
    if (source === null || target === null) {
      return;
    }
    if (
      target.scrollTop === source.scrollTop &&
      target.scrollLeft === source.scrollLeft
    ) {
      return;
    }
    isSyncing.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
  };

  return (
    <div className="SideBySideDiff__panels">
      <Panel
        expanded={expanded}
        items={items}
        onScroll={() => syncScroll('left')}
        onToggle={onToggle}
        panelRef={leftRef}
        side="left"
      />
      <Panel
        expanded={expanded}
        items={items}
        onScroll={() => syncScroll('right')}
        onToggle={onToggle}
        panelRef={rightRef}
        side="right"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified (single column) view
// ---------------------------------------------------------------------------

type UnifiedPhysicalLine = {
  oldNo: number | null;
  newNo: number | null;
  marker: string;
  kind: 'context' | 'removed' | 'added';
  cell: DiffCell;
};

/**
 * Expand a row into the physical line(s) of a unified diff. A `modified` row
 * becomes a `-` line followed by a `+` line, mirroring how unified diffs encode
 * an edit.
 */
function toUnifiedLines(row: DiffRow): Array<UnifiedPhysicalLine> {
  if (row.type === 'unchanged' && row.left && row.right) {
    return [
      {
        cell: row.left,
        kind: 'context',
        marker: ' ',
        newNo: row.right.lineNumber,
        oldNo: row.left.lineNumber,
      },
    ];
  }
  if (row.type === 'added' && row.right) {
    return [
      {
        cell: row.right,
        kind: 'added',
        marker: '+',
        newNo: row.right.lineNumber,
        oldNo: null,
      },
    ];
  }
  if (row.type === 'removed' && row.left) {
    return [
      {
        cell: row.left,
        kind: 'removed',
        marker: '-',
        newNo: null,
        oldNo: row.left.lineNumber,
      },
    ];
  }
  if (row.type === 'modified' && row.left && row.right) {
    return [
      {
        cell: row.left,
        kind: 'removed',
        marker: '-',
        newNo: null,
        oldNo: row.left.lineNumber,
      },
      {
        cell: row.right,
        kind: 'added',
        marker: '+',
        newNo: row.right.lineNumber,
        oldNo: null,
      },
    ];
  }
  return [];
}

function UnifiedRow({row}: {row: DiffRow}): JSX.Element {
  if (row.type === 'hunk') {
    return (
      <div className="SideBySideDiff__uline SideBySideDiff__uline--hunk">
        <span className="SideBySideDiff__ugutter" />
        <span className="SideBySideDiff__ugutter" />
        <span className="SideBySideDiff__umarker" />
        <span className="SideBySideDiff__content">{row.header}</span>
      </div>
    );
  }
  return (
    <>
      {toUnifiedLines(row).map((line, index) => (
        <div
          className={`SideBySideDiff__uline SideBySideDiff__uline--${line.kind}`}
          key={index}>
          <span className="SideBySideDiff__ugutter">{line.oldNo ?? ''}</span>
          <span className="SideBySideDiff__ugutter">{line.newNo ?? ''}</span>
          <span className="SideBySideDiff__umarker">{line.marker}</span>
          <CellContent cell={line.cell} />
        </div>
      ))}
    </>
  );
}

function UnifiedView({
  items,
  expanded,
  onToggle,
}: {
  items: Array<RenderItem>;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
}): JSX.Element {
  return (
    <div className="SideBySideDiff__panel SideBySideDiff__panel--unified">
      {items.map(item => {
        if (item.kind === 'collapsed') {
          const isOpen = expanded.has(item.id);
          return (
            <React.Fragment key={item.key}>
              <CollapsedBand
                count={item.rows.length}
                expanded={isOpen}
                onToggle={() => onToggle(item.id)}
              />
              {isOpen &&
                item.rows.map((row, k) => (
                  <UnifiedRow key={`${item.key}-${k}`} row={row} />
                ))}
            </React.Fragment>
          );
        }
        return <UnifiedRow key={item.key} row={item.row} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ViewToggle({
  viewMode,
  onSelect,
}: {
  viewMode: DiffViewMode;
  onSelect: (mode: DiffViewMode) => void;
}): JSX.Element {
  return (
    <div className="SideBySideDiff__toolbar">
      <div className="SideBySideDiff__toggle" role="group">
        <button
          aria-pressed={viewMode === 'split'}
          className={`SideBySideDiff__toggleBtn${
            viewMode === 'split' ? 'SideBySideDiff__toggleBtn--active' : ''
          }`}
          onClick={() => onSelect('split')}
          type="button">
          Side-by-side
        </button>
        <button
          aria-pressed={viewMode === 'unified'}
          className={`SideBySideDiff__toggleBtn${
            viewMode === 'unified' ? 'SideBySideDiff__toggleBtn--active' : ''
          }`}
          onClick={() => onSelect('unified')}
          type="button">
          Unified
        </button>
      </div>
    </div>
  );
}

export default function SideBySideDiffComponent({
  className,
  format,
  nodeKey,
  diff,
  viewMode,
}: {
  className: Readonly<{base: string; focus: string}>;
  format: ElementFormatType | null;
  nodeKey: NodeKey;
  diff: string;
  viewMode: DiffViewMode;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const rows = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const items = useMemo(() => buildRenderItems(rows), [rows]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const onToggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onSelectView = (mode: DiffViewMode) => {
    if (mode === viewMode) {
      return;
    }
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isSideBySideDiffNode(node)) {
        node.setViewMode(mode);
      }
    });
  };

  return (
    <BlockWithAlignableContents
      className={className}
      format={format}
      nodeKey={nodeKey}>
      <div className="SideBySideDiff__container">
        <ViewToggle onSelect={onSelectView} viewMode={viewMode} />
        {viewMode === 'split' ? (
          <SplitView expanded={expanded} items={items} onToggle={onToggle} />
        ) : (
          <UnifiedView expanded={expanded} items={items} onToggle={onToggle} />
        )}
      </div>
    </BlockWithAlignableContents>
  );
}
