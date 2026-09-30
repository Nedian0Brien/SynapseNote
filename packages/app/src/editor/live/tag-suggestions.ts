import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorState, type Extension } from '@codemirror/state';
import { t } from '@lingui/core/macro';
import {
  buildTagSuggestionItems,
  fetchTags,
  type TagSummaryEntry,
} from '../extensions/tag-suggestion-data';

export function createLiveTagSource(
  allowed: (state: EditorState, position: number) => boolean,
  fetcher: () => Promise<TagSummaryEntry[]> = fetchTags,
): (context: CompletionContext) => Promise<CompletionResult | null> {
  let tags: TagSummaryEntry[] = [];
  let fetchedAt = 0;
  let pending: Promise<TagSummaryEntry[]> | null = null;
  return async (context) => {
    if (!allowed(context.state, context.pos)) return null;
    const line = context.state.doc.lineAt(context.pos);
    const before = context.state.doc.sliceString(line.from, context.pos);
    if (before.lastIndexOf('[[') > before.lastIndexOf(']]')) return null;
    const match = /(?:^|\s)#([a-zA-Z][\w/-]*)?$/.exec(before);
    if (!match) return null;
    const query = match[1] ?? '';
    if (Date.now() - fetchedAt > 5000) {
      pending ??= fetcher().catch(() => []);
      tags = await pending;
      fetchedAt = Date.now();
      pending = null;
    }
    return {
      from: context.pos - query.length,
      filter: false,
      options: buildTagSuggestionItems(tags, query).map((item) => ({
        label: item.value,
        detail: item.kind === 'create' ? t`Create tag` : String(item.count),
        type: 'constant',
        apply(view, _completion, from, to) {
          const suffix = view.state.doc.sliceString(to, to + 1) === ' ' ? '' : ' ';
          const insert = item.value + suffix;
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length },
            userEvent: 'input.complete',
          });
          view.focus();
        },
      })),
    };
  };
}

export function createLiveTagSuggestions(
  allowed: (state: EditorState, position: number) => boolean,
): Extension {
  const source = createLiveTagSource(allowed);
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}
