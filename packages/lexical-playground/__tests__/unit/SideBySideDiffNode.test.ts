/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {CodeHighlightNode, CodeNode} from '@lexical/code';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/markdown';
import {$getRoot} from 'lexical';
import {initializeUnitTest} from 'lexical/src/__tests__/utils';
import {describe, expect, it} from 'vitest';

import {
  $createSideBySideDiffNode,
  $isSideBySideDiffNode,
  SideBySideDiffNode,
} from '../../src/nodes/SideBySideDiffNode/SideBySideDiffNode';
import {PLAYGROUND_TRANSFORMERS} from '../../src/plugins/MarkdownTransformers';

const DIFF = ['@@ -1,2 +1,2 @@', ' keep', '-old', '+new'].join('\n');

describe('SideBySideDiffNode', () => {
  initializeUnitTest(
    testEnv => {
      it('round-trips through JSON serialization', () => {
        const {editor} = testEnv;
        editor.update(
          () => {
            $getRoot().clear();
            $getRoot().append($createSideBySideDiffNode(DIFF));
          },
          {discrete: true},
        );

        const json = editor.getEditorState().toJSON();
        const diffJSON = json.root.children[0] as unknown as {
          type: string;
          diff: string;
          viewMode: string;
        };
        expect(diffJSON.type).toBe('side-by-side-diff');
        expect(diffJSON.diff).toBe(DIFF);
        expect(diffJSON.viewMode).toBe('split');

        // Re-import and confirm the node and its data survive.
        const state = editor.parseEditorState(JSON.stringify(json));
        state.read(() => {
          const node = $getRoot().getFirstChild();
          expect($isSideBySideDiffNode(node)).toBe(true);
          expect((node as SideBySideDiffNode).getDiff()).toBe(DIFF);
        });
      });

      it('defaults to split view and toggles to unified', () => {
        const {editor} = testEnv;
        editor.update(
          () => {
            $getRoot().clear();
            $getRoot().append($createSideBySideDiffNode(DIFF));
          },
          {discrete: true},
        );
        editor.read(() => {
          const node = $getRoot().getFirstChild() as SideBySideDiffNode;
          expect(node.getViewMode()).toBe('split');
        });

        editor.update(
          () => {
            const node = $getRoot().getFirstChild() as SideBySideDiffNode;
            node.toggleViewMode();
          },
          {discrete: true},
        );
        editor.read(() => {
          const node = $getRoot().getFirstChild() as SideBySideDiffNode;
          expect(node.getViewMode()).toBe('unified');
        });
      });

      it('serializes and restores the view mode', () => {
        const {editor} = testEnv;
        editor.update(
          () => {
            $getRoot().clear();
            $getRoot().append($createSideBySideDiffNode(DIFF, 'unified'));
          },
          {discrete: true},
        );

        const json = editor.getEditorState().toJSON();
        const state = editor.parseEditorState(JSON.stringify(json));
        state.read(() => {
          const node = $getRoot().getFirstChild() as SideBySideDiffNode;
          expect(node.getViewMode()).toBe('unified');
        });
      });

      it('defaults legacy nodes without viewMode to split', () => {
        const {editor} = testEnv;
        editor.update(
          () => {
            $getRoot().clear();
            $getRoot().append($createSideBySideDiffNode(DIFF));
          },
          {discrete: true},
        );
        const json = editor.getEditorState().toJSON();
        // Simulate a node serialized before the toggle existed.
        const child = json.root.children[0] as unknown as {
          viewMode?: string;
        };
        delete child.viewMode;

        const state = editor.parseEditorState(JSON.stringify(json));
        state.read(() => {
          const node = $getRoot().getFirstChild() as SideBySideDiffNode;
          expect(node.getViewMode()).toBe('split');
        });
      });

      it('imports a ```diff fenced block as a SideBySideDiffNode', () => {
        const {editor} = testEnv;
        const markdown = ['```diff', ...DIFF.split('\n'), '```'].join('\n');
        editor.update(
          () => {
            $getRoot().clear();
            $convertFromMarkdownString(markdown, PLAYGROUND_TRANSFORMERS);
          },
          {discrete: true},
        );

        editor.read(() => {
          const node = $getRoot().getFirstChild();
          expect($isSideBySideDiffNode(node)).toBe(true);
          expect((node as SideBySideDiffNode).getDiff()).toBe(DIFF);
        });
      });

      it('exports a SideBySideDiffNode back to a ```diff fenced block', () => {
        const {editor} = testEnv;
        editor.update(
          () => {
            $getRoot().clear();
            $getRoot().append($createSideBySideDiffNode(DIFF));
          },
          {discrete: true},
        );

        let markdown = '';
        editor.read(() => {
          markdown = $convertToMarkdownString(PLAYGROUND_TRANSFORMERS);
        });
        expect(markdown).toBe(
          ['```diff', ...DIFF.split('\n'), '```'].join('\n'),
        );
      });

      it('completes a full markdown round-trip', () => {
        const {editor} = testEnv;
        const markdown = ['```diff', ...DIFF.split('\n'), '```'].join('\n');
        editor.update(
          () => {
            $getRoot().clear();
            $convertFromMarkdownString(markdown, PLAYGROUND_TRANSFORMERS);
          },
          {discrete: true},
        );
        let exported = '';
        editor.read(() => {
          exported = $convertToMarkdownString(PLAYGROUND_TRANSFORMERS);
        });
        expect(exported).toBe(markdown);
      });

      it('does not hijack a non-diff fenced code block', () => {
        const {editor} = testEnv;
        const markdown = ['```js', 'const x = 1;', '```'].join('\n');
        editor.update(
          () => {
            $getRoot().clear();
            $convertFromMarkdownString(markdown, PLAYGROUND_TRANSFORMERS);
          },
          {discrete: true},
        );
        editor.read(() => {
          const node = $getRoot().getFirstChild();
          expect($isSideBySideDiffNode(node)).toBe(false);
        });
      });
    },
    {
      namespace: 'test',
      nodes: [SideBySideDiffNode, CodeNode, CodeHighlightNode],
      theme: {},
    },
  );
});
