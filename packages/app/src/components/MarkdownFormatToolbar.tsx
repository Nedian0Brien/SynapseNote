import { Trans, useLingui } from '@lingui/react/macro';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Table2,
} from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getEditorForDoc, subscribeEditorRegistry } from '@/editor/active-editor';
import { LinkEditPopover } from '@/editor/bubble-menu/LinkEditPopover';

interface MarkdownFormatToolbarProps {
  activeDocName: string | null;
  isSourceMode: boolean;
}

/**
 * Markdown's contextual formatting controls.
 *
 * A bare control group, not a row: it renders into `DocumentViewerHeader`'s
 * `toolbar` slot so the viewer has ONE header band instead of an identity row
 * with a tool band stacked beneath it. It therefore owns no height, border,
 * background, or horizontal padding — the header row supplies all of those.
 */
export function MarkdownFormatToolbar({ activeDocName, isSourceMode }: MarkdownFormatToolbarProps) {
  const { t } = useLingui();
  const editor = useSyncExternalStore(
    subscribeEditorRegistry,
    () => (activeDocName ? getEditorForDoc(activeDocName) : null),
    () => null,
  );

  return (
    <div
      data-testid="markdown-format-toolbar"
      className="pointer-events-auto flex min-w-0 items-center"
      role="toolbar"
      aria-label={t`Markdown formatting`}
    >
      {isSourceMode ? (
        <span className="text-xs text-muted-foreground">
          <Trans>Markdown source</Trans>
        </span>
      ) : editor && !editor.isDestroyed ? (
        <MarkdownFormatActions editor={editor} />
      ) : (
        <div className="flex items-center gap-1" aria-hidden="true">
          {['heading', 'inline', 'list', 'task', 'quote', 'link', 'table'].map((slot) => (
            <span key={slot} className="size-8 rounded-md bg-muted/35" />
          ))}
        </div>
      )}
    </div>
  );
}

function MarkdownFormatActions({ editor }: { editor: Editor }) {
  const { t } = useLingui();
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading1: current.isActive('heading', { level: 1 }),
      heading2: current.isActive('heading', { level: 2 }),
      heading3: current.isActive('heading', { level: 3 }),
      bold: current.isActive('strong'),
      italic: current.isActive('emphasis'),
      bulletList:
        current.isActive('list', { ordered: false }) &&
        !current.isActive('listItem', { checked: true }) &&
        !current.isActive('listItem', { checked: false }),
      orderedList: current.isActive('list', { ordered: true }),
      taskList:
        current.isActive('listItem', { checked: true }) ||
        current.isActive('listItem', { checked: false }),
      blockquote: current.isActive('blockquote'),
    }),
  });

  const actions = [
    {
      id: 'heading1',
      label: t`Heading 1`,
      icon: Heading1,
      pressed: active.heading1,
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: 'heading2',
      label: t`Heading 2`,
      icon: Heading2,
      pressed: active.heading2,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: 'heading3',
      label: t`Heading 3`,
      icon: Heading3,
      pressed: active.heading3,
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      id: 'bold',
      label: t`Bold`,
      icon: Bold,
      pressed: active.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      id: 'italic',
      label: t`Italic`,
      icon: Italic,
      pressed: active.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      id: 'bullet-list',
      label: t`Bullet List`,
      icon: List,
      pressed: active.bulletList,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: 'ordered-list',
      label: t`Ordered List`,
      icon: ListOrdered,
      pressed: active.orderedList,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      id: 'task-list',
      label: t`Task List`,
      icon: ListTodo,
      pressed: active.taskList,
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      id: 'blockquote',
      label: t`Quote`,
      icon: Quote,
      pressed: active.blockquote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ] as const;

  return (
    <div className="subtle-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {actions.map((action, index) => (
        <span key={action.id} className="contents">
          {index === 3 || index === 5 ? (
            <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />
          ) : null}
          <FormatButton {...action} />
        </span>
      ))}
      <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />
      <div className="shrink-0 [&_[data-slot=button]]:size-8 [&_[data-slot=button]]:rounded-md">
        <LinkEditPopover editor={editor} />
      </div>
      <FormatButton
        id="table"
        label={t`Table`}
        icon={Table2}
        pressed={false}
        run={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />
    </div>
  );
}

function FormatButton({
  label,
  icon: Icon,
  pressed,
  run,
}: {
  id: string;
  label: string;
  icon: typeof Bold;
  pressed: boolean;
  run: () => boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-md data-[state=on]:bg-muted"
          aria-label={label}
          aria-pressed={pressed}
          data-state={pressed ? 'on' : 'off'}
          onMouseDown={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
