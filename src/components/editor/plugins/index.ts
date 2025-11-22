import { ReactEditor } from 'slate-react';

import { withCopy } from '@/components/editor/plugins/withCopy';
import { withDelete } from '@/components/editor/plugins/withDelete';
import { withElement } from '@/components/editor/plugins/withElement';
import { withInsertBreak } from '@/components/editor/plugins/withInsertBreak';
import { withInsertData } from '@/components/editor/plugins/withInsertData';
import { withInsertText } from '@/components/editor/plugins/withInsertText';
import { withMarkdown } from '@/components/editor/plugins/withMarkdown';
import { withPasted } from '@/components/editor/plugins/withPasted';

export function withPlugins(editor: ReactEditor) {
  return withInsertData(withPasted(withCopy(withMarkdown(withInsertBreak(withDelete(withInsertText(withElement(editor))))))));
}
