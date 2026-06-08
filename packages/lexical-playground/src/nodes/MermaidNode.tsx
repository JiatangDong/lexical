/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  DOMExportOutput,
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from 'lexical';
import type {JSX} from 'react';

import './MermaidNode.css';

import {BlockWithAlignableContents} from '@lexical/react/LexicalBlockWithAlignableContents';
import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from '@lexical/react/LexicalDecoratorBlockNode';
import mermaid from 'mermaid';
import * as React from 'react';
import {useEffect, useState} from 'react';

let didInitializeMermaid = false;

function initializeMermaid() {
  if (!didInitializeMermaid) {
    mermaid.initialize({
      securityLevel: 'strict',
      startOnLoad: false,
    });
    didInitializeMermaid = true;
  }
}

type MermaidComponentProps = Readonly<{
  className: Readonly<{
    base: string;
    focus: string;
  }>;
  format: ElementFormatType | null;
  nodeKey: NodeKey;
  source: string;
}>;

function MermaidComponent({
  className,
  format,
  nodeKey,
  source,
}: MermaidComponentProps): JSX.Element {
  const reactId = React.useId();
  const diagramId = React.useMemo(
    () => `lexical-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [reactId],
  );
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let isMounted = true;

    async function renderDiagram() {
      initializeMermaid();
      setError(null);
      setSvg(null);

      try {
        const result = await mermaid.render(diagramId, source);
        if (isMounted) {
          setSvg(result.svg);
        }
      } catch (error_) {
        if (isMounted) {
          setError(error_ instanceof Error ? error_.message : String(error_));
        }
      }
    }

    void renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [diagramId, source]);

  const zoomIn = () => {
    setScale(currentScale => Math.min(currentScale + 0.25, 3));
  };

  const zoomOut = () => {
    setScale(currentScale => Math.max(currentScale - 0.25, 0.25));
  };

  const resetZoom = () => {
    setScale(1);
  };

  const openInNewTab = () => {
    if (svg === null) {
      return;
    }
    const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const renderControls = (
    controlsClassName = 'MermaidNode__controls',
    includeClose = false,
  ) =>
    svg === null ? null : (
      <div
        className={controlsClassName}
        onMouseDown={event => event.preventDefault()}>
        <button aria-label="Zoom out" onClick={zoomOut} type="button">
          -
        </button>
        <button aria-label="Reset zoom" onClick={resetZoom} type="button">
          {Math.round(scale * 100)}%
        </button>
        <button aria-label="Zoom in" onClick={zoomIn} type="button">
          +
        </button>
        {!includeClose && (
          <button
            aria-label="Expand chart"
            onClick={() => setIsExpanded(true)}
            type="button">
            Expand
          </button>
        )}
        <button
          aria-label="Open chart in new tab"
          onClick={openInNewTab}
          type="button">
          Open
        </button>
        {includeClose && (
          <button
            aria-label="Close expanded chart"
            onClick={() => setIsExpanded(false)}
            type="button">
            Close
          </button>
        )}
      </div>
    );

  const renderDiagram = () =>
    svg === null ? null : (
      <div className="MermaidNode__viewport">
        <div
          className="MermaidNode__diagram"
          dangerouslySetInnerHTML={{__html: svg}}
          style={{zoom: scale}}
        />
      </div>
    );

  return (
    <BlockWithAlignableContents
      className={className}
      format={format}
      nodeKey={nodeKey}>
      <div className="MermaidNode__container">
        {error !== null ? (
          <pre className="MermaidNode__error">{error}</pre>
        ) : (
          <>
            {renderControls()}
            {renderDiagram()}
          </>
        )}
      </div>
      {isExpanded && (
        <div className="MermaidNode__modal" role="dialog">
          <button
            aria-label="Close expanded chart"
            className="MermaidNode__modalBackdrop"
            onClick={() => setIsExpanded(false)}
          />
          <div className="MermaidNode__modalContent">
            {renderControls('MermaidNode__modalControls', true)}
            {renderDiagram()}
          </div>
        </div>
      )}
    </BlockWithAlignableContents>
  );
}

export type SerializedMermaidNode = Spread<
  {
    source: string;
  },
  SerializedDecoratorBlockNode
>;

export class MermaidNode extends DecoratorBlockNode {
  __source: string;

  static getType(): string {
    return 'mermaid';
  }

  static clone(node: MermaidNode): MermaidNode {
    return new MermaidNode(node.__source, node.__format, node.__key);
  }

  static importJSON(serializedNode: SerializedMermaidNode): MermaidNode {
    return $createMermaidNode(serializedNode.source).updateFromJSON(
      serializedNode,
    );
  }

  constructor(
    source: string,
    format?: ElementFormatType | null,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__source = source;
  }

  exportJSON(): SerializedMermaidNode {
    return {
      ...super.exportJSON(),
      source: this.getSource(),
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('pre');
    element.setAttribute('data-lexical-mermaid', 'true');
    element.textContent = this.__source;
    return {element};
  }

  updateDOM(): false {
    return false;
  }

  getSource(): string {
    return this.getLatest().__source;
  }

  getTextContent(): string {
    return this.getSource();
  }

  setSource(source: string): this {
    const writable = this.getWritable();
    writable.__source = source;
    return writable;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {};
    const className = {
      base: embedBlockTheme.base || '',
      focus: embedBlockTheme.focus || '',
    };
    return (
      <MermaidComponent
        className={className}
        format={this.__format}
        nodeKey={this.getKey()}
        source={this.__source}
      />
    );
  }
}

export function $createMermaidNode(source: string): MermaidNode {
  return new MermaidNode(source);
}

export function $isMermaidNode(
  node: LexicalNode | null | undefined,
): node is MermaidNode {
  return node instanceof MermaidNode;
}
