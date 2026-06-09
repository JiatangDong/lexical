/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {JSX} from 'react';

import {$insertNodeToNearestRoot} from '@lexical/utils';
import {
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  defineExtension,
  LexicalCommand,
  LexicalEditor,
} from 'lexical';
import {useState} from 'react';

import {
  $createSideBySideDiffNode,
  SideBySideDiffNode,
} from '../../nodes/SideBySideDiffNode/SideBySideDiffNode';
import Button from '../../ui/Button';
import {DialogActions} from '../../ui/Dialog';

const SAMPLE_DIFF = `@@ -1,4 +1,4 @@
 function greet(name) {
-  return "Hello, " + name;
+  return \`Hello, \${name}!\`;
 }
 export default greet;`;

export const INSERT_SIDE_BY_SIDE_DIFF_COMMAND: LexicalCommand<string> =
  createCommand('INSERT_SIDE_BY_SIDE_DIFF_COMMAND');

export const SideBySideDiffExtension = defineExtension({
  name: '@lexical/playground/SideBySideDiff',
  nodes: [SideBySideDiffNode],
  register: editor =>
    editor.registerCommand<string>(
      INSERT_SIDE_BY_SIDE_DIFF_COMMAND,
      payload => {
        const diffNode = $createSideBySideDiffNode(payload);
        $insertNodeToNearestRoot(diffNode);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
});

export function InsertSideBySideDiffDialog({
  activeEditor,
  onClose,
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
}): JSX.Element {
  const [diff, setDiff] = useState(SAMPLE_DIFF);

  const onClick = () => {
    activeEditor.dispatchCommand(INSERT_SIDE_BY_SIDE_DIFF_COMMAND, diff);
    onClose();
  };

  return (
    <>
      <div style={{marginBottom: 8}}>
        Paste a unified diff (e.g. the output of <code>git diff</code>):
      </div>
      <textarea
        className="SideBySideDiff__input"
        onChange={event => setDiff(event.target.value)}
        rows={10}
        style={{
          boxSizing: 'border-box',
          fontFamily: 'monospace',
          fontSize: 12,
          width: '100%',
        }}
        value={diff}
      />
      <DialogActions>
        <Button disabled={diff.trim() === ''} onClick={onClick}>
          Confirm
        </Button>
      </DialogActions>
    </>
  );
}
