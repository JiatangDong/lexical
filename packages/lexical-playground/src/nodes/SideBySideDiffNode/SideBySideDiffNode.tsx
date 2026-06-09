/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from 'lexical';
import type {JSX} from 'react';

import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from '@lexical/react/LexicalDecoratorBlockNode';
import * as React from 'react';

const SideBySideDiffComponent = React.lazy(
  () => import('./SideBySideDiffComponent'),
);

/**
 * How the diff is rendered: `split` shows two synchronized columns
 * (old | new); `unified` shows a single column with `-`/`+` lines inline.
 */
export type DiffViewMode = 'split' | 'unified';

const DEFAULT_VIEW_MODE: DiffViewMode = 'split';

function normalizeViewMode(value: unknown): DiffViewMode {
  return value === 'unified' ? 'unified' : DEFAULT_VIEW_MODE;
}

export type SerializedSideBySideDiffNode = Spread<
  {
    diff: string;
    viewMode: DiffViewMode;
  },
  SerializedDecoratorBlockNode
>;

function $convertSideBySideDiffElement(
  domNode: HTMLElement,
): null | DOMConversionOutput {
  const diff = domNode.getAttribute('data-lexical-diff');
  if (diff !== null) {
    const node = $createSideBySideDiffNode(
      diff,
      normalizeViewMode(domNode.getAttribute('data-lexical-diff-view')),
    );
    return {node};
  }
  return null;
}

export class SideBySideDiffNode extends DecoratorBlockNode {
  __diff: string;
  __viewMode: DiffViewMode;

  static getType(): string {
    return 'side-by-side-diff';
  }

  static clone(node: SideBySideDiffNode): SideBySideDiffNode {
    return new SideBySideDiffNode(
      node.__diff,
      node.__viewMode,
      node.__format,
      node.__key,
    );
  }

  static importJSON(
    serializedNode: SerializedSideBySideDiffNode,
  ): SideBySideDiffNode {
    return $createSideBySideDiffNode(
      serializedNode.diff,
      // viewMode is optional for backwards compatibility with nodes
      // serialized before the toggle existed (they default to split).
      normalizeViewMode(serializedNode.viewMode),
    ).updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedSideBySideDiffNode {
    return {
      ...super.exportJSON(),
      diff: this.__diff,
      viewMode: this.__viewMode,
    };
  }

  constructor(
    diff: string,
    viewMode: DiffViewMode = DEFAULT_VIEW_MODE,
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__diff = diff;
    this.__viewMode = viewMode;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-lexical-diff')) {
          return null;
        }
        return {
          conversion: $convertSideBySideDiffElement,
          priority: 2,
        };
      },
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div');
    element.setAttribute('data-lexical-diff', this.__diff);
    element.setAttribute('data-lexical-diff-view', this.__viewMode);
    element.textContent = this.__diff;
    return {element};
  }

  updateDOM(): false {
    return false;
  }

  getDiff(): string {
    return this.getLatest().__diff;
  }

  setDiff(diff: string): this {
    const writable = this.getWritable();
    writable.__diff = diff;
    return writable;
  }

  getViewMode(): DiffViewMode {
    return this.getLatest().__viewMode;
  }

  setViewMode(viewMode: DiffViewMode): this {
    const writable = this.getWritable();
    writable.__viewMode = viewMode;
    return writable;
  }

  toggleViewMode(): this {
    return this.setViewMode(
      this.getLatest().__viewMode === 'split' ? 'unified' : 'split',
    );
  }

  getTextContent(): string {
    return this.__diff;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const theme = config.theme;
    const className = {
      base: theme.sideBySideDiff || '',
      focus: theme.sideBySideDiffFocus || '',
    };
    return (
      <SideBySideDiffComponent
        className={className}
        format={this.__format}
        nodeKey={this.getKey()}
        diff={this.__diff}
        viewMode={this.__viewMode}
      />
    );
  }
}

export function $createSideBySideDiffNode(
  diff: string,
  viewMode: DiffViewMode = DEFAULT_VIEW_MODE,
): SideBySideDiffNode {
  return new SideBySideDiffNode(diff, viewMode);
}

export function $isSideBySideDiffNode(
  node: LexicalNode | null | undefined,
): node is SideBySideDiffNode {
  return node instanceof SideBySideDiffNode;
}
