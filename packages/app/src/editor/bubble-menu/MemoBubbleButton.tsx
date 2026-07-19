import { Trans } from '@lingui/react/macro';
import type { Editor } from '@tiptap/react';
import { StickyNote } from 'lucide-react';
import type { ReactNode } from 'react';
import { memoQuoteFromSelection, requestMemoComposer } from '@/components/memo-composer-events';
import { Button } from '@/components/ui/button';
import { selectionSnapshotFromWysiwyg } from '@/editor/selection-context';
import { getEditorDocName } from '../extensions/doc-context';

/** Opens the right-rail Memo composer with the current rich-text selection attached. */
export function MemoBubbleButton({ editor }: { editor: Editor }): ReactNode {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="memo-bubble-button"
      className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
      onClick={() => {
        const docName = getEditorDocName(editor);
        if (docName === null) return;
        const selection = selectionSnapshotFromWysiwyg(editor, docName);
        if (selection === null) return;
        requestMemoComposer({ docName, quote: memoQuoteFromSelection(selection) });
      }}
    >
      <StickyNote className="size-3.5" aria-hidden="true" />
      <span>
        <Trans>Memo</Trans>
      </span>
    </Button>
  );
}
