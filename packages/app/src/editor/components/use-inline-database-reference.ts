import type { DatabaseLinkedViewSettings } from '@nedian0brien/synapsenote-core';
import type { InlineDatabaseReference } from './inline-database-types';
import { useJsxComponentHost } from './jsx-host-context.tsx';

export interface UseInlineDatabaseReferenceOptions {
  reference: InlineDatabaseReference;
  localViewOverrides: DatabaseLinkedViewSettings | undefined;
  setLocalViewOverrides: (value: DatabaseLinkedViewSettings | undefined) => void;
  setFocusInlineNewRecord: (value: boolean) => void;
  setInlineSearchOpen: (open: boolean) => void;
  setInlineSearchQuery: (value: string) => void;
  setReplacementPickerOpen: (open: boolean) => void;
}

export function useInlineDatabaseReference({
  reference,
  localViewOverrides,
  setLocalViewOverrides,
  setFocusInlineNewRecord,
  setInlineSearchOpen,
  setInlineSearchQuery,
  setReplacementPickerOpen,
}: UseInlineDatabaseReferenceOptions) {
  'use no memo';
  const host = useJsxComponentHost();

  const applyReference = (
    next: { databaseId: string; sourceId: string; viewId: string },
    options: { focusNewRecord?: boolean } = {},
  ) => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number') return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    const nextMode = reference.success ? reference.data.mode : 'inline';
    const sameView =
      reference.success &&
      reference.data.databaseId === next.databaseId &&
      reference.data.sourceId === next.sourceId &&
      reference.data.viewId === next.viewId;
    const nextProps = {
      ...(node.attrs.props as Record<string, unknown> | undefined),
      ...next,
      mode: nextMode,
    } as Record<string, unknown>;
    delete nextProps.create;
    delete nextProps.creationId;
    delete nextProps.creationName;
    if (sameView && localViewOverrides) nextProps.viewOverrides = localViewOverrides;
    else delete nextProps.viewOverrides;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        props: nextProps,
      }),
    );
    setLocalViewOverrides(sameView ? localViewOverrides : undefined);
    editor.view.focus();
    setFocusInlineNewRecord(options.focusNewRecord === true);
    setInlineSearchOpen(false);
    setInlineSearchQuery('');
    setReplacementPickerOpen(false);
  };

  const persistCreationIntent = (intent: { id: string; name: string }) => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number') return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    const currentProps = (node.attrs.props as Record<string, unknown> | undefined) ?? {};
    if (
      currentProps.create === 'blank' &&
      currentProps.creationId === intent.id &&
      currentProps.creationName === intent.name &&
      currentProps.mode === 'inline'
    ) {
      return;
    }
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        props: {
          ...currentProps,
          create: 'blank',
          creationId: intent.id,
          creationName: intent.name,
          mode: 'inline',
        },
      }),
    );
  };

  const persistLinkedViewOverrides = (next: DatabaseLinkedViewSettings | undefined) => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number' || !reference.success) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    const nextProps = {
      ...(node.attrs.props as Record<string, unknown> | undefined),
      databaseId: reference.data.databaseId,
      sourceId: reference.data.sourceId,
      viewId: reference.data.viewId,
      mode: reference.data.mode,
    } as Record<string, unknown>;
    if (next) nextProps.viewOverrides = next;
    else delete nextProps.viewOverrides;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        props: nextProps,
      }),
    );
    setLocalViewOverrides(next);
  };

  const setInlineMode = (nextMode: 'inline' | 'full-page') => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number' || !reference.success) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        props: {
          ...(node.attrs.props as Record<string, unknown> | undefined),
          databaseId: reference.data.databaseId,
          sourceId: reference.data.sourceId,
          viewId: reference.data.viewId,
          mode: nextMode,
          ...(localViewOverrides ? { viewOverrides: localViewOverrides } : {}),
        },
      }),
    );
    editor.view.focus();
    setFocusInlineNewRecord(false);
  };

  const removeLinkedView = () => {
    const editor = host?.editor;
    const pos = host?.getPos();
    if (!editor || typeof pos !== 'number') return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'jsxComponent') return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    editor.view.focus();
  };

  return {
    applyReference,
    persistCreationIntent,
    persistLinkedViewOverrides,
    setInlineMode,
    removeLinkedView,
  };
}
