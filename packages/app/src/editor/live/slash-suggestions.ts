import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { startCompletion } from '@codemirror/autocomplete';
import { EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import { type BlockKind, PREVIEW_EMBED_STARTERS } from '@nedian0brien/synapsenote-core';
import { createDatabaseCreationId } from '@/lib/database-creation';
import { dispatchDatabaseSlashCommand } from '@/lib/database-events';
import { BLANK_HTML_BODY, EMBED_STARTER_ALIASES } from '../slash-command/embed-source';
import { openLiveLinkEditor } from './link-editor';
import { liveComponentSource, liveSlashComponents } from './slash-components';
import { pickLiveUpload } from './uploads';

interface SlashItem {
  label: string;
  aliases: string[];
  block?: BlockKind;
  source?: string;
  buildSource?: () => string;
  run?: (view: EditorView) => void;
  description?: string;
  inline?: boolean;
  selectInserted?: boolean;
}

function items(): SlashItem[] {
  return [
    { label: t`Text`, aliases: ['text', 'paragraph'], block: 'paragraph' },
    { label: t`Heading 1`, aliases: ['heading', 'h1'], block: 'h1' },
    { label: t`Heading 2`, aliases: ['heading', 'h2'], block: 'h2' },
    { label: t`Heading 3`, aliases: ['heading', 'h3'], block: 'h3' },
    { label: t`Heading 4`, aliases: ['heading', 'h4'], block: 'h4' },
    { label: t`Heading 5`, aliases: ['heading', 'h5'], block: 'h5' },
    { label: t`Heading 6`, aliases: ['heading', 'h6'], block: 'h6' },
    { label: t`Bullet list`, aliases: ['bullet', 'list', 'unordered'], block: 'bullet' },
    { label: t`Numbered list`, aliases: ['numbered', 'ordered', 'list'], block: 'ordered' },
    { label: t`Task list`, aliases: ['task', 'todo', 'checkbox'], block: 'task' },
    { label: t`Quote`, aliases: ['quote', 'blockquote'], block: 'quote' },
    { label: t`Code block`, aliases: ['code', 'fence'], block: 'code' },
    { label: t`Table`, aliases: ['table', 'grid'], source: '|  |  |\n| --- | --- |\n|  |  |\n\n' },
    { label: t`Separator`, aliases: ['separator', 'divider', 'hr'], source: '---\n\n' },
    { label: t`Math`, aliases: ['math', 'equation', 'latex'], source: '$$\n\n$$\n\n' },
    { label: t`Mermaid`, aliases: ['mermaid', 'diagram'], source: '```mermaid\ngraph TD\n```\n\n' },
    { label: t`Comment`, aliases: ['comment', 'note'], source: '<!--\n\n-->\n\n' },
    {
      label: t`File`,
      aliases: ['file', 'attachment', 'download', 'upload', 'document', 'zip'],
      run: pickLiveUpload,
    },
    {
      label: t`HTML`,
      aliases: ['html', 'embed', 'preview', 'iframe', 'sandbox', 'web', 'snippet'],
      source: `\`\`\`html preview\n${BLANK_HTML_BODY}\n\`\`\`\n\n`,
    },
    ...PREVIEW_EMBED_STARTERS.map((starter) => ({
      label: starter.title,
      aliases: [starter.id, 'html', ...(EMBED_STARTER_ALIASES[starter.id] ?? [])],
      description: starter.description,
      source: `\`\`\`html preview\n${starter.html}\n\`\`\`\n\n`,
    })),
    ...liveSlashComponents.map((descriptor) => ({
      label: descriptor.displayName ?? descriptor.name,
      aliases: [descriptor.name, ...(descriptor.searchTerms ?? [])],
      description: descriptor.description,
      buildSource: () => liveComponentSource(descriptor.name),
    })),
    {
      label: t`New database`,
      aliases: ['database', 'collection', 'create database', 'database page'],
      run: () => dispatchDatabaseSlashCommand('new'),
    },
    {
      label: t`Linked database`,
      aliases: ['linked database', 'linked view', 'existing database', 'database view'],
      buildSource: () => liveComponentSource('DatabaseView'),
    },
    {
      label: t`Inline database`,
      aliases: ['inline table', 'inline view', 'embedded database', 'database in page'],
      buildSource: () =>
        liveComponentSource('DatabaseView', {
          create: 'blank',
          creationId: createDatabaseCreationId(),
          creationName: 'Untitled database',
        }),
    },
    {
      label: t`Link`,
      aliases: ['url', 'href', 'hyperlink', 'wiki', 'wikilink', 'internal'],
      source: 'link',
      inline: true,
      selectInserted: true,
      run: (view) => openLiveLinkEditor(view, true),
    },
    {
      label: t`Tag`,
      aliases: ['tag', 'hashtag', 'label'],
      source: '#',
      inline: true,
      run: startCompletion,
    },
  ];
}

export type ApplySlashBlock = (
  view: EditorView,
  from: number,
  to: number,
  block: BlockKind,
) => void;

/** Register with the existing autocomplete state rather than installing another instance. */
export function createLiveSlashSuggestions(
  applyBlock: ApplySlashBlock,
  allowed: (state: EditorState, position: number) => boolean,
  applyFootnote?: (view: EditorView, from: number, to: number) => void,
): Extension {
  const source = createLiveSlashSource(applyBlock, allowed, applyFootnote);
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}

export function createLiveSlashSource(
  applyBlock: ApplySlashBlock,
  allowed: (state: EditorState, position: number) => boolean,
  applyFootnote?: (view: EditorView, from: number, to: number) => void,
): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    if (!allowed(context.state, context.pos)) return null;
    const line = context.state.doc.lineAt(context.pos);
    const before = context.state.doc.sliceString(line.from, context.pos);
    const match = /(?:^|\s)\/([\p{L}\p{N}_-]*)$/u.exec(before);
    if (!match) return null;
    const query = match[1].toLocaleLowerCase();
    const from = context.pos - match[1].length - 1;
    const choices: SlashItem[] = items();
    if (applyFootnote)
      choices.push({
        label: t`Footnote`,
        aliases: ['footnote', 'aside', 'reference'],
        run: (view) =>
          applyFootnote(view, view.state.selection.main.from, view.state.selection.main.to),
      });
    const options: Completion[] = choices
      .filter((item) =>
        [item.label, ...item.aliases].some((value) => value.toLocaleLowerCase().includes(query)),
      )
      .map((item) => ({
        label: item.label,
        type: 'keyword',
        info: item.description,
        apply(view, _completion, start, end) {
          if (item.label === t`Footnote` && applyFootnote) {
            applyFootnote(view, start, end);
            view.focus();
            return;
          }
          if (item.block) applyBlock(view, start, end, item.block);
          else if (item.source || item.buildSource) {
            const line = view.state.doc.lineAt(start);
            const inline = item.inline;
            const lead =
              !inline && view.state.doc.sliceString(line.from, start).trim() ? '\n\n' : '';
            const tail = !inline && view.state.doc.sliceString(end, line.to).trim() ? '\n\n' : '';
            const insert = lead + (item.buildSource?.() ?? item.source ?? '') + tail;
            view.dispatch({
              changes: { from: start, to: end, insert },
              selection: {
                anchor: item.selectInserted ? start : start + insert.length,
                head: start + insert.length,
              },
              userEvent: 'input.complete',
              scrollIntoView: true,
            });
          } else if (item.run)
            view.dispatch({ changes: { from: start, to: end }, userEvent: 'input.complete' });
          view.focus();
          item.run?.(view);
        },
      }));
    return { from, options, filter: false };
  };
}
