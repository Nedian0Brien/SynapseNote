// one page in morrow's editor, set up like morrow's src/app/editor/PageEditor.tsx with the native app as host
import { Editor, Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import katex from 'katex';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { displayTitle } from '../vendor/morrow/src/core/model';
import type { DocNode, PageId, PageMeta } from '../vendor/morrow/src/core/model';
import { findPagesByTitle, pageIdByTitle, resolveLinkTarget } from '../vendor/morrow/src/core/search';
import { docToMarkdown } from '../vendor/morrow/src/core/markdown/serialize';
import { docToHtml } from '../vendor/morrow/src/core/site';
import { ancestorsOf, isEffectivelyTrashed } from '../vendor/morrow/src/core/tree';
import { Emoji } from '../vendor/morrow/src/app/components/Emoji';
import type { BlockMenuRequest } from '../vendor/morrow/src/app/editor/BlockHandle';
import { registerCommit, setFocusedEditor } from '../vendor/morrow/src/app/editor/commits';
import { BlockMenu, FormattingMenu, LinkMenu, openHref, TableMenu } from '../vendor/morrow/src/app/editor/EditorMenus';
import { FindBar } from '../vendor/morrow/src/app/editor/FindBar';
import { createExtensions } from '../vendor/morrow/src/app/editor/extensions';
import { createPage, openToday } from '../vendor/morrow/src/app/operations';
import { PageTags } from '../vendor/morrow/src/app/components/TagsView';
import { toast } from '../vendor/morrow/src/app/ui';
import { getSession, getState, run } from '../vendor/morrow/src/app/workspace';
import { Smile } from 'lucide-react';
import { post } from './bridge';
import { navigate, openPage } from './host/router';

// the same pause morrow waits before writing an edit back
export const COMMIT_DELAY_MS = 250;

const NOT_YET = {
  child: 'Databases and canvases are not available yet.',
};

// the html of a page shown inside another, never the page itself so embeds cannot loop
const embedCache = new WeakMap<object, string>();
function embedHtml(id: PageId, hostId: PageId): string | null {
  const state = getState();
  const page = state.pages[id];
  const doc = state.docs[id];
  if (!page || !doc || id === hostId || page.encrypted || isEffectivelyTrashed(state.pages, id)) return null;
  const cached = embedCache.get(doc);
  if (cached !== undefined) return cached;
  const html = docToHtml(doc, {
    href: (target) => (state.pages[target] ? `#/page/${target}` : null),
    assetPath: (fileId) => getSession().fileUrl(fileId) ?? '',
    titleOf: (target) => (state.pages[target] ? displayTitle(state.pages[target]) : null),
    renderMath: (latex, display) => katex.renderToString(latex, { throwOnError: false, displayMode: display }),
  });
  embedCache.set(doc, html);
  return html;
}

// the page title, renamed as it is typed like morrow's TitleField in src/app/components/PageView.tsx
function TitleField({ page, onEnter }: { page: PageMeta; onEnter: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  });
  return (
    <textarea
      ref={ref}
      className="page-title"
      rows={1}
      placeholder="Untitled"
      aria-label="Page title"
      value={page.title}
      spellCheck
      onChange={(event) => run({ type: 'page.rename', id: page.id, title: event.target.value, now: Date.now() })}
      onKeyDown={(event) => {
        const target = event.currentTarget;
        const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
        // enter while composing a korean syllable finishes the syllable, it does not leave the title
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || (event.key === 'ArrowDown' && atEnd)) {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

// text to select when the page opens, a new id for each request
export interface FindRequest {
  text: string;
  id: number;
}

interface Props {
  page: PageMeta;
  doc: DocNode;
  editable: boolean;
  find: FindRequest | null;
}

// the editor on screen, for the app's cmd k
let mounted: Editor | null = null;

// opens the link editor for selected text, as cmd k in the editor does; the app asks first, then opens search
export function linkSelection(): boolean {
  if (!mounted || mounted.isDestroyed || mounted.state.selection.empty || !mounted.view.hasFocus()) return false;
  mounted.view.dom.dispatchEvent(new Event('morrow:edit-link'));
  return true;
}

export function EditorApp({ page, doc, editable, find }: Props) {
  const pageId = page.id;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [blockMenu, setBlockMenu] = useState<BlockMenuRequest | null>(null);
  const [finding, setFinding] = useState(false);
  const committed = useRef<DocNode>(doc);
  // lets an outside change of the document reset what counts as unchanged
  const baselineRef = useRef<((value: string) => void) | null>(null);

  useEffect(() => {
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // the editor adjusts a document as it loads it and as it is clicked, such as embeds and blank lines;
    // those changes are not the person's, so nothing is written until they type, paste, drop or click, and
    // never when the markdown morrow would write is the same as for the document as it was loaded
    let touched = false;
    let baseline = docToMarkdown(doc);

    const commit = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!dirty || instance.isDestroyed) return;
      dirty = false;
      const next = instance.getJSON() as DocNode;
      const markdown = docToMarkdown(next);
      if (markdown === baseline) return;
      baseline = markdown;
      committed.current = next;
      run({ type: 'page.setDoc', id: pageId, doc: next, now: Date.now() });
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
            void getSession().flush();
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
          subscribe: (listener) => getSession().subscribe(listener),
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
          createPage: (title) => createPage({ parentId: pageId, title, open: false }),
          resolveTarget: (target) => resolveLinkTarget(getState(), target),
          // obsidian makes a missing linked page at the top of the vault, so does morrow
          createFromTarget: (target) => createPage({ title: target.split('/').pop() || target, open: false }),
          openTag: (tag) => navigate({ name: 'tag', tag }),
          renderEmbed: (id) => embedHtml(id, pageId),
          createChild: () => {
            toast(NOT_YET.child);
            return null;
          },
          openDate: (date) => openToday(date),
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
        if (!touched) return;
        dirty = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(commit, COMMIT_DELAY_MS);
      },
    });
    baselineRef.current = (value) => {
      baseline = value;
    };

    // anything the person does on the page counts, including the editor's menus, which live outside its element
    const touch = () => {
      touched = true;
    };
    const events = ['keydown', 'beforeinput', 'compositionstart', 'paste', 'drop', 'pointerdown'] as const;
    for (const type of events) document.addEventListener(type, touch, true);

    instance.on('focus', () => setFocusedEditor(instance));
    const unregister = registerCommit(commit);
    setEditor(instance);
    mounted = instance;

    return () => {
      if (mounted === instance) mounted = null;
      for (const type of events) document.removeEventListener(type, touch, true);
      commit();
      unregister();
      setFocusedEditor(null);
      setEditor(null);
      setBlockMenu(null);
      // menus unregister their plugins during the same unmount, destroy once they are done
      setTimeout(() => instance.destroy(), 0);
    };
    // a new page builds a new editor, the host remounts this component with a key per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // content changed outside this editor, such as a file edited in another app
  useEffect(() => {
    if (!editor || editor.isDestroyed || doc === committed.current) return;
    committed.current = doc;
    editor.commands.setContent(doc as JSONContent, { emitUpdate: false });
    baselineRef.current?.(docToMarkdown(doc));
  }, [doc, editor]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable);
  }, [editor, editable]);

  // opens with the match selected and in view, as morrow's PageEditor; the app keeps the page's address, so
  // the request is not cleared through it
  const found = useRef(0);
  useEffect(() => {
    if (!editor || editor.isDestroyed || !find || found.current === find.id) return;
    found.current = find.id;
    const term = find.text.toLowerCase();
    let match: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (match) return false;
      if (!node.isTextblock) return true;
      const text = node.textBetween(0, node.content.size, undefined, '\ufffc').toLowerCase();
      const index = text.indexOf(term);
      if (index !== -1) match = { from: pos + 1 + index, to: pos + 1 + index + term.length };
      return false;
    });
    // typescript does not follow the assignment inside the callback
    const hit = match as { from: number; to: number } | null;
    if (hit) editor.chain().focus().setTextSelection(hit).scrollIntoView().run();
  }, [editor, find]);

  // the app's find command
  useEffect(() => {
    const open = () => setFinding(true);
    window.addEventListener('morrow:find', open);
    return () => window.removeEventListener('morrow:find', open);
  }, []);

  return (
    <div className="page-scroll">
      <article className="page font-sans width-comfortable">
        {page.icon ? (
          <div className="page-icon-row">
            <button
              type="button"
              className="page-icon"
              aria-label="Change icon"
              onClick={() => post({ type: 'chooseIcon', pageId: page.id })}
            >
              <Emoji emoji={page.icon} />
            </button>
          </div>
        ) : (
          <div className="page-header-actions">
            <button type="button" className="add-icon" onClick={() => post({ type: 'chooseIcon', pageId: page.id })}>
              <Smile size={14} /> Add icon
            </button>
          </div>
        )}
        <h1 className="page-title-heading">
          <TitleField page={page} onEnter={() => editor?.chain().focus('start').run()} />
        </h1>
        {page.kind !== 'database' && <PageTags page={page} editable={editable} />}
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
            {blockMenu && <BlockMenu editor={editor} request={blockMenu} onClose={() => setBlockMenu(null)} />}
          </div>
        ) : (
          <div className="editor-loading" aria-hidden="true" />
        )}
      </article>
    </div>
  );
}
