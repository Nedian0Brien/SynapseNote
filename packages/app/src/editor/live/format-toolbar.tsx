import { type EditorState, type Extension, StateField } from '@codemirror/state';
import { type EditorView, showTooltip, type Tooltip } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import {
  type BlockKind,
  canInsertSourceFootnote,
  computeLayout,
  type EditAction,
  type MarkType,
} from '@nedian0brien/synapsenote-core';
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link,
  StickyNote,
  Strikethrough,
  Superscript,
} from 'lucide-react';
import { memoQuoteFromSelection, requestMemoComposer } from '@/components/memo-composer-events';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { selectionSnapshotFromSource } from '../selection-context';
import { openLiveLinkEditor } from './link-editor';
import { livePortalRegistryFor } from './live-portals';
import type { MediaContext } from './media-widgets';

type Toggle = Extract<EditAction, { type: 'toggle' }>['mark'];
const formats: { mark: Toggle; type: MarkType; icon: typeof Bold; label: () => string }[] = [
  { mark: 'bold', type: 'strong', icon: Bold, label: () => t`Bold` },
  { mark: 'italic', type: 'emphasis', icon: Italic, label: () => t`Italic` },
  { mark: 'strike', type: 'delete', icon: Strikethrough, label: () => t`Strikethrough` },
  { mark: 'code', type: 'inlineCode', icon: Code, label: () => t`Inline code` },
  { mark: 'highlight', type: 'mark', icon: Highlighter, label: () => t`Highlight` },
];
function blockOptions(): [BlockKind, string][] {
  return [
    ['paragraph', t`Text`],
    ['h1', t`Heading 1`],
    ['h2', t`Heading 2`],
    ['h3', t`Heading 3`],
    ['h4', t`Heading 4`],
    ['h5', t`Heading 5`],
    ['h6', t`Heading 6`],
    ['bullet', t`Bullet list`],
    ['ordered', t`Numbered list`],
    ['task', t`Task list`],
    ['quote', t`Quote`],
    ['code', t`Code block`],
  ];
}
function FormatToolbar({
  view,
  apply,
  context,
}: {
  view: EditorView;
  apply: (view: EditorView, action: EditAction) => void;
  context: MediaContext;
}) {
  const selection = view.state.selection.main;
  // Inspect only the selected paragraph lines when the toolbar updates.
  const first = view.state.doc.lineAt(selection.from).from;
  const last = view.state.doc.lineAt(selection.to).to;
  const marks = computeLayout(view.state.doc.sliceString(first, last)).marks;
  return (
    <div
      role="toolbar"
      aria-label={t`Text formatting`}
      className="flex items-center gap-1 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
          >{t`Block type`}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            view.focus();
          }}
        >
          {blockOptions().map(([block, label]) => (
            <DropdownMenuItem
              key={block}
              onSelect={() => {
                apply(view, { type: 'block', block });
                view.focus();
              }}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {formats.map(({ mark, type, icon: Icon, label }) => (
        <Button
          key={mark}
          variant="ghost"
          size="icon-sm"
          className="aria-pressed:bg-muted"
          aria-label={label()}
          title={label()}
          aria-pressed={marks.some(
            (span) =>
              span.type === type &&
              span.open[1] <= selection.from - first &&
              span.close[0] >= selection.to - first,
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            apply(view, { type: 'toggle', mark });
            view.focus();
          }}
        >
          <Icon size={16} />
        </Button>
      ))}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t`Link`}
        title={t`Link`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => openLiveLinkEditor(view)}
      >
        <Link size={16} />
      </Button>
      {!context.nested ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Footnote`}
          title={t`Footnote`}
          disabled={
            !canInsertSourceFootnote(
              view.state.doc.sliceString(first, last),
              selection.from - first,
              selection.to - first,
            )
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            apply(view, { type: 'footnote' });
            view.focus();
          }}
        >
          <Superscript size={16} />
        </Button>
      ) : null}
      {context.docName && !context.nested ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Memo`}
          title={t`Memo`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const selection = selectionSnapshotFromSource(view, context.docName ?? '');
            if (selection)
              requestMemoComposer({
                docName: selection.docName,
                quote: memoQuoteFromSelection(selection),
              });
          }}
        >
          <StickyNote size={16} />
        </Button>
      ) : null}
    </div>
  );
}

export function createLiveFormatToolbar(
  context: MediaContext,
  apply: (view: EditorView, action: EditAction) => void,
  allowed: (state: EditorState, position: number) => boolean,
): Extension {
  const create = (view: EditorView) => {
    const dom = document.createElement('div');
    dom.className = 'cm-live-format-toolbar';
    const registry = context.portalRegistry ?? livePortalRegistryFor(view);
    const content = () => <FormatToolbar view={view} apply={apply} context={context} />;
    const id = registry.register(dom, content());
    return {
      dom,
      update: () => registry.update(id, content()),
      destroy: () => registry.unregister(id),
    };
  };
  const tooltip = (state: EditorState): Tooltip | null => {
    const selection = state.selection.main;
    if (selection.empty || !allowed(state, selection.from) || !allowed(state, selection.to))
      return null;
    return { pos: selection.head, above: true, strictSide: false, create };
  };
  return StateField.define<Tooltip | null>({
    create: tooltip,
    update(value, transaction) {
      return transaction.docChanged || transaction.selection ? tooltip(transaction.state) : value;
    },
    provide: (field) => showTooltip.from(field),
  });
}
