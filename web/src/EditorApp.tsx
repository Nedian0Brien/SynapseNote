// one page in morrow's editor, set up like morrow's src/app/editor/PageEditor.tsx with the native app as host
import { Editor, Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import katex from 'katex';
import { useEffect, useRef, useState } from 'react';
import { displayTitle } from '../vendor/morrow/src/core/model';
import type { DocNode, PageId } from '../vendor/morrow/src/core/model';
import { findPagesByTitle, pageIdByTitle, resolveLinkTarget } from '../vendor/morrow/src/core/search';
import { docToHtml } from '../vendor/morrow/src/core/site';
import { ancestorsOf, isEffectivelyTrashed } from '../vendor/morrow/src/core/tree';
import { SourceDialog } from '../vendor/morrow/src/app/components/SourceDialog';
import { Emoji } from '../vendor/morrow/src/app/components/Emoji';
import { Toasts } from '../vendor/morrow/src/app/components/primitives';
import type { BlockMenuRequest } from '../vendor/morrow/src/app/editor/BlockHandle';
import { BlockMenu, FormattingMenu, LinkMenu, openHref, TableMenu } from '../vendor/morrow/src/app/editor/EditorMenus';
import { FindBar } from '../vendor/morrow/src/app/editor/FindBar';
import { createExtensions } from '../vendor/morrow/src/app/editor/extensions';
import { toast, useUi } from '../vendor/morrow/src/app/ui';
import { post } from './bridge';
import { createPage, getState, setDoc, subscribe } from './host/pages';
import { openPage } from './host/router';

// the same pause morrow waits before writing an edit back
export const COMMIT_DELAY_MS = 250;

const NOT_YET = {
  tag: 'Tag pages are not available yet.',
  date: 'Daily notes are not available yet.',
  child: 'Databases and canvases are not available yet.',
};

// the html of a page shown inside another, never the page itself so embeds cannot loop
function embedHtml(id: PageId, hostId: PageId): string | null {
  const state = getState();
  const page = state.pages[id];
  const doc = state.docs[id];
  if (!page || !doc || id === hostId || page.encrypted || isEffectivelyTrashed(state.pages, id)) return null;
  return docToHtml(doc, {
    href: (target) => (state.pages[target] ? `#/page/${target}` : null),
    assetPath: () => '',
    titleOf: (target) => (state.pages[target] ? displayTitle(state.pages[target]) : null),
    renderMath: (latex, display) => katex.renderToString(latex, { throwOnError: false, displayMode: display }),
  });
}

interface Props {
  pageId: PageId;
  doc: DocNode;
  editable: boolean;
  // set by the host so the native app can ask for pending edits right away
  onFlushReady: (flush: () => void) => void;
}

export function EditorApp({ pageId, doc, editable, onFlushReady }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [blockMenu, setBlockMenu] = useState<BlockMenuRequest | null>(null);
  const [finding, setFinding] = useState(false);
  const ui = useUi();
  const page = getState().pages[pageId];
  const flushRef = useRef(onFlushReady);
  flushRef.current = onFlushReady;

  useEffect(() => {
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const commit = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!dirty || instance.isDestroyed) return;
      dirty = false;
      const next = instance.getJSON() as DocNode;
      setDoc(pageId, next);
      post({ type: 'docChanged', pageId, doc: next });
    };

    const shortcuts = Extension.create({
      name: 'synapseShortcuts',
      addKeyboardShortcuts() {
        return {
          'Mod-k': ({ editor: current }) => {
            if (current.state.selection.empty) return false;
            current.view.dom.dispatchEvent(new Event('morrow:edit-link'));
            return true;
          },
          'Mod-f': () => {
            setFinding(true);
            return true;
          },
          'Mod-s': () => {
            commit();
            return true;
          },
        };
      },
    });

    const titleOf = (id: PageId) => {
      const pages = getState().pages;
      return pages[id] && !isEffectivelyTrashed(pages, id) ? displayTitle(pages[id]) : null;
    };

    const instance = new Editor({
      extensions: [
        ...createExtensions({
          getTitle: titleOf,
          getIcon: (id) => getState().pages[id]?.icon ?? null,
          subscribe,
          open: openPage,
          findPages: (query) =>
            findPagesByTitle(getState(), query, 8)
              .filter((found) => found.id !== pageId)
              .map((found) => ({
                id: found.id,
                title: displayTitle(found),
                path: ancestorsOf(getState().pages, found.id)
                  .reverse()
                  .map((ancestor) => displayTitle(ancestor))
                  .join(' / '),
              })),
          createPage: (title) => createPage({ parentId: pageId, title }),
          resolveTarget: (target) => resolveLinkTarget(getState(), target),
          // obsidian makes a missing linked page at the top of the vault, so does morrow
          createFromTarget: (target) => createPage({ parentId: null, title: target.split('/').pop() || target }),
          openTag: () => toast(NOT_YET.tag),
          renderEmbed: (id) => embedHtml(id, pageId),
          createChild: () => {
            toast(NOT_YET.child);
            return null;
          },
          openDate: () => toast(NOT_YET.date),
          onBlockMenu: setBlockMenu,
          resolvePage: (title) => pageIdByTitle(getState(), title),
        }),
        shortcuts,
      ],
      content: doc as JSONContent,
      editable,
      editorProps: {
        attributes: { class: 'prose', 'aria-label': 'Page content', spellcheck: 'true' },
        handleClickOn: (_view, _pos, node, _nodePos, event) => {
          const href = node.marks?.find((mark) => mark.type.name === 'link')?.attrs.href;
          if (href && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            openHref(String(href));
            return true;
          }
          return false;
        },
      },
      onUpdate: () => {
        dirty = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(commit, COMMIT_DELAY_MS);
      },
    });

    flushRef.current(commit);
    setEditor(instance);

    return () => {
      commit();
      setEditor(null);
      setBlockMenu(null);
      // menus unregister their plugins during the same unmount, destroy once they are done
      setTimeout(() => instance.destroy(), 0);
    };
    // a new page builds a new editor, the host remounts this component with a key per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable);
  }, [editor, editable]);

  const dialog = ui.dialog?.kind === 'source' ? ui.dialog : null;

  return (
    <div className="view">
      <div className="page-scroll">
        <article className="page font-sans width-comfortable">
          {page?.icon && (
            <div className="page-icon-row">
              <span className="page-icon">
                <Emoji emoji={page.icon} />
              </span>
            </div>
          )}
          <h1 className="page-title-heading">
            <span className="page-title">{displayTitle(page)}</span>
          </h1>
          {editor ? (
            <div className="editor-host">
              {finding && <FindBar editor={editor} onClose={() => setFinding(false)} />}
              <EditorContent editor={editor} className="editor-surface" />
              {editable && (
                <>
                  <FormattingMenu editor={editor} />
                  <LinkMenu editor={editor} />
                  <TableMenu editor={editor} />
                </>
              )}
              {blockMenu && (
                <BlockMenu editor={editor} request={blockMenu} onClose={() => setBlockMenu(null)} />
              )}
            </div>
          ) : (
            <div className="editor-loading" aria-hidden="true" />
          )}
        </article>
      </div>
      {dialog && (
        <SourceDialog
          title={dialog.title}
          value={dialog.value}
          language={dialog.language}
          displayMode={dialog.displayMode ?? false}
          onSave={dialog.onSave}
        />
      )}
      <Toasts />
    </div>
  );
}
