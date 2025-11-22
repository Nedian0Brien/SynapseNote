import { Range } from 'slate';
import { ReactEditor } from 'slate-react';

import { YjsEditor } from '@/application/slate-yjs';
import { isEmbedBlockTypes } from '@/application/slate-yjs/command/const';
import { getBlockEntry } from '@/application/slate-yjs/utils/editor';
import { BlockType } from '@/application/types';

export const clipboardFormatKey = 'x-appflowy-fragment';

export const withCopy = (editor: ReactEditor) => {
  const { setFragmentData } = editor;

  editor.setFragmentData = (data: Pick<DataTransfer, 'getData' | 'setData'>) => {
    const { selection } = editor;

    if (!selection) {
      return;
    }

    if (Range.isCollapsed(selection)) {
      const entry = getBlockEntry(editor as YjsEditor);

      if (!entry) return;

      const [node] = entry;

      if (node && isEmbedBlockTypes(node.type as BlockType)) {
        const fragment = editor.getFragment();
        const string = JSON.stringify(fragment);
        const encoded = window.btoa(encodeURIComponent(string));

        data.setData(`application/${clipboardFormatKey}`, encoded);
      }

      return;
    }

    setFragmentData(data as DataTransfer);
  };

  return editor;
};
