import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/source-serif-4/index.css';
import '@fontsource-variable/source-serif-4/wght-italic.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import '../vendor/morrow/src/app/styles/tokens.css';
import '../vendor/morrow/src/app/styles/app.css';
import '../vendor/morrow/src/app/styles/editor.css';
import '../vendor/morrow/src/app/styles/features.css';
import '../vendor/morrow/src/app/styles/color.css';
import '../vendor/morrow/src/app/styles/blocks.css';
import 'katex/dist/katex.min.css';
import './editor.css';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { displayTitle } from '../vendor/morrow/src/core/model';
import type { PageId, PageMeta } from '../vendor/morrow/src/core/model';
import { docToPlainText, findUnknownTypes } from '../vendor/morrow/src/core/doc';
import { isEffectivelyTrashed } from '../vendor/morrow/src/core/tree';
import { WorkspaceSession } from '../vendor/morrow/src/storage/session';
import { VaultRepository } from '../vendor/morrow/src/storage/vaultRepository';
import { SourceDialog } from '../vendor/morrow/src/app/components/SourceDialog';
import { Toasts } from '../vendor/morrow/src/app/components/primitives';
import { commitEditors } from '../vendor/morrow/src/app/editor/commits';
import {
  createFromTemplate,
  createPage,
  createTemplatesPage,
  openToday,
  saveAsTemplate,
  trashPage,
} from '../vendor/morrow/src/app/operations';
import { parseDateKey } from '../vendor/morrow/src/core/daily';
import { findTemplatesPage } from '../vendor/morrow/src/core/templates';
import { newId } from '../vendor/morrow/src/app/platform/files';
import { useUi } from '../vendor/morrow/src/app/ui';
import { getSession, run, setSession, useWorkspace } from '../vendor/morrow/src/app/workspace';
import { listen, post } from './bridge';
import type { Theme } from './bridge';
import { CanvasPage } from './CanvasPage';
import { DatabasePage } from './DatabasePage';
import { EditorApp, linkSelection } from './EditorApp';
import type { FindRequest } from './EditorApp';
import * as queries from './queries';
import { createReviews } from './review';
import type { Reviews } from './review';
import { collectCards } from '../vendor/morrow/src/core/flashcards';
import { HistoryDialog } from '../vendor/morrow/src/app/components/HistoryDialog';
import { openDialog } from '../vendor/morrow/src/app/ui';
import { showRoute } from './host/router';
import { settle } from './host/rpc';
import { deliverChanges, nativeVaultBridge } from './host/vaultBridge';

const root = document.documentElement;
const applyTheme = (theme: Theme) => {
  root.dataset.theme = theme;
};
applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
root.dataset.accent = 'ocean';
root.dataset.colorful = 'true';

// errors in the page are reported to the native app, which logs them
window.addEventListener('error', (event) => post({ type: 'log', level: 'error', message: String(event.message) }));
window.addEventListener('unhandledrejection', (event) =>
  post({ type: 'log', level: 'error', message: String(event.reason) }),
);

type Phase = { kind: 'waiting' } | { kind: 'ready' };

// state outside react, so messages that arrive before the first render are not lost
let phase: Phase = { kind: 'waiting' };
let shown: PageId | null = null;
let find: FindRequest | null = null;
let findCount = 0;
let rerender: () => void = () => {};
// flashcard progress for the open vault
let reviews: Reviews | null = null;

// sends the page list and save state, gathered over a few milliseconds; a timer rather than an animation
// frame, which webkit holds back while the window is hidden
let reportQueued = false;
function report(): void {
  if (reportQueued) return;
  reportQueued = true;
  setTimeout(() => {
    reportQueued = false;
    const session = getSession();
    const status = session.saveStatus;
    const pages = session.getState().pages;
    post({
      type: 'workspace',
      pages,
      locked: [...session.unreadable].filter((id) => pages[id]?.encrypted),
      saveState: status.state,
      saveError: status.error,
    });
  }, 16);
}

async function openVault(name: string): Promise<void> {
  if (phase.kind !== 'waiting') return;
  const repository = new VaultRepository(nativeVaultBridge(name), newId);
  const opened = await WorkspaceSession.open(repository);
  if (!opened.ok) {
    post({ type: 'vaultFailed', message: opened.error });
    return;
  }
  const session = opened.value;
  // keystrokes still waiting in an editor are saved before an outside edit is read
  session.beforeExternal = commitEditors;
  // new vaults start empty, morrow's guide describes features this app does not have yet
  await session.markInitialized();
  setSession(session);
  reviews = createReviews({ read: () => session.readMeta('review.json'), write: (text) => session.writeMeta('review.json', text) });
  await reviews.load();
  session.subscribe(report);
  session.queue.subscribe(report);
  phase = { kind: 'ready' };
  report();
  rerender();
}

function show(pageId: PageId | null, text: string | null): void {
  commitEditors();
  shown = pageId;
  // a new request each time, the same words asked for again select them again
  find = pageId && text ? { text, id: ++findCount } : null;
  showRoute(pageId);
  rerender();
}

function query(name: string, params: Record<string, unknown>): string | null {
  if (phase.kind !== 'ready') return null;
  const state = getSession().getState();
  const id = typeof params.id === 'string' ? params.id : '';
  const limit = typeof params.limit === 'number' ? params.limit : 30;
  switch (name) {
    case 'search':
      return JSON.stringify(queries.search(state, typeof params.query === 'string' ? params.query : '', limit));
    case 'recent':
      return JSON.stringify(queries.recent(state, limit));
    case 'home':
      return JSON.stringify(queries.home(state, getSession().activity(), new Date()));
    case 'backlinks':
      return JSON.stringify(queries.backlinks(state, id));
    case 'mentions':
      return JSON.stringify(queries.mentions(state, id));
    case 'outline':
      return JSON.stringify(queries.outline(state.docs[id]));
    case 'tags':
      return JSON.stringify(queries.tags(state));
    case 'tagPages':
      return JSON.stringify(queries.tagPages(state, typeof params.tag === 'string' ? params.tag : ''));
    case 'tasks':
      return JSON.stringify(queries.tasks(state));
    case 'templates':
      return JSON.stringify(queries.templates(state));
    case 'counts':
      return JSON.stringify(queries.counts(state, reviews?.log() ?? {}, new Date()));
    case 'review':
      return JSON.stringify(queries.review(state, reviews?.log() ?? {}, new Date()));
    case 'graph':
      return JSON.stringify(
        queries.graph(state, {
          tags: params.tags === true,
          hierarchy: params.hierarchy === true,
          orphans: params.orphans !== false,
          focus: typeof params.focus === 'string' ? params.focus : null,
          depth: typeof params.depth === 'number' ? params.depth : 1,
        }),
      );
    default:
      return null;
  }
}

// the open page's top level headings, as morrow's outline finds them
function scrollToHeading(index: number): void {
  const headings = document.querySelectorAll<HTMLElement>(
    '.editor-surface .prose > h1, .editor-surface .prose > h2, .editor-surface .prose > h3',
  );
  headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function flush(): Promise<boolean> {
  if (phase.kind !== 'ready') return true;
  commitEditors();
  await reviews?.flush();
  return getSession().flush();
}

// encrypting and unlocking take a password typed in the native app; the answer says whether it worked
async function encryption(action: string, params: Record<string, unknown>): Promise<string> {
  if (phase.kind !== 'ready') return JSON.stringify({ ok: false, error: 'No vault is open.' });
  const id = typeof params.id === 'string' ? params.id : '';
  const password = typeof params.password === 'string' ? params.password : '';
  const result =
    action === 'protect'
      ? await getSession().protectPage(id, password)
      : action === 'unlock'
        ? await getSession().unlockPage(id, password)
        : null;
  if (!result) return JSON.stringify({ ok: false, error: 'Unknown request.' });
  return JSON.stringify(result.ok ? { ok: true } : { ok: false, error: result.error });
}

// which pages open in the text editor follows morrow's PageView: canvases and databases have views of their
// own, unreadable pages and pages with content this version does not know are never handed to the editor,
// because the editor would rewrite them in a form it understands
function Page({ pageId, find }: { pageId: PageId; find: FindRequest | null }) {
  const state = useWorkspace();
  const page = state.pages[pageId];
  const doc = state.docs[pageId];
  // when the page was last opened, for recent pages, as morrow's PageView records it; not for canvases yet,
  // saving a canvas's page record writes its .canvas file anew, which waits for the canvas view
  const opened = useRef<PageId | null>(null);
  useEffect(() => {
    const current = getSession().getState().pages[pageId];
    if (opened.current === pageId || !current || current.kind === 'canvas') return;
    opened.current = pageId;
    run({ type: 'page.markOpened', id: pageId, now: Date.now() });
  }, [pageId]);
  if (!page || !doc || isEffectivelyTrashed(state.pages, pageId)) return <Empty />;
  if (page.kind === 'canvas')
    return <CanvasPage page={page} doc={doc} unreadable={getSession().unreadable.has(pageId)} />;
  // as morrow's PageView, a database is editable unless its folder note could not be read
  if (page.kind === 'database') return <DatabasePage page={page} editable={!getSession().unreadable.has(pageId)} />;
  // a locked page asks for its password in the native app, over the page
  if (getSession().unreadable.has(pageId) && page.encrypted) return <Empty />;
  if (getSession().unreadable.has(pageId))
    return (
      <Notice
        page={page}
        text="The content of this page could not be read. It has been left untouched and is protected from changes."
      />
    );
  const unknown = findUnknownTypes(doc);
  if (unknown.length > 0)
    return (
      <Notice
        page={page}
        text={`This page contains content SynapseNote does not know yet (${unknown.join(', ')}). It is shown as plain text and protected from changes so nothing is lost.`}
        plain={docToPlainText(doc)}
      />
    );
  return <EditorApp key={pageId} page={page} doc={doc} editable find={find} />;
}

function Notice({ page, text, plain }: { page: PageMeta; text: string; plain?: string }) {
  return (
    <div className="page-scroll">
      <article className="page font-sans width-comfortable">
        <h1 className="page-title-heading">
          <span className="page-title">{displayTitle(page)}</span>
        </h1>
        <div className="banner" role="note">
          {text}
        </div>
        {plain !== undefined && <pre className="readonly-text">{plain}</pre>}
      </article>
    </div>
  );
}

function Empty() {
  return <div className="page-scroll" aria-hidden="true" />;
}

function Host() {
  const [, setTick] = useState(0);
  const ui = useUi();
  useEffect(() => {
    rerender = () => setTick((tick) => tick + 1);
    // the app opens the vault only after this, once the host can show it
    post({ type: 'ready' });
  }, []);
  const dialog = ui.dialog?.kind === 'source' ? ui.dialog : null;
  const history = ui.dialog?.kind === 'history' ? ui.dialog : null;
  return (
    <div className="view">
      {phase.kind === 'ready' && shown ? <Page key={shown} pageId={shown} find={find} /> : <Empty />}
      {dialog && (
        <SourceDialog
          title={dialog.title}
          value={dialog.value}
          language={dialog.language}
          displayMode={dialog.displayMode ?? false}
          onSave={dialog.onSave}
        />
      )}
      {history && <HistoryDialog pageId={history.pageId} />}
      <Toasts />
    </div>
  );
}

listen((message) => {
  switch (message.type) {
    case 'openVault':
      void openVault(message.name).catch((error: unknown) =>
        post({ type: 'vaultFailed', message: error instanceof Error ? error.message : String(error) }),
      );
      break;
    case 'show':
      show(message.pageId, message.find);
      break;
    case 'rpcResult':
      settle(message.id, message);
      break;
    case 'vaultChanges':
      deliverChanges(message.changes);
      break;
    case 'createPage': {
      if (phase.kind !== 'ready') break;
      const id = createPage({ parentId: message.parentId, kind: message.kind, open: false });
      if (id) post({ type: 'openPage', pageId: id });
      break;
    }
    case 'trashPage':
      if (phase.kind === 'ready') trashPage(message.pageId);
      break;
    case 'command':
      if (phase.kind === 'ready') run(message.command);
      break;
    case 'theme':
      applyTheme(message.theme);
      break;
    case 'scrollToHeading':
      scrollToHeading(message.index);
      break;
    case 'find':
      window.dispatchEvent(new Event('morrow:find'));
      break;
    // the rest are morrow's operations, which open what they make through the app
    case 'openToday':
      if (phase.kind === 'ready') openToday((message.date && parseDateKey(message.date)) || new Date());
      break;
    case 'createFromTemplate':
      if (phase.kind === 'ready') createFromTemplate(message.templateId, message.parentId);
      break;
    case 'newTemplate': {
      if (phase.kind !== 'ready') break;
      // as morrow's template dialog does when there are no templates
      const container = findTemplatesPage(getSession().getState());
      if (container) createPage({ parentId: container.id, title: 'New template' });
      else createTemplatesPage();
      break;
    }
    case 'openTemplates':
      if (phase.kind === 'ready') createTemplatesPage();
      break;
    case 'saveAsTemplate':
      if (phase.kind === 'ready') saveAsTemplate(message.pageId);
      break;
    case 'openHistory':
      if (phase.kind === 'ready') openDialog({ kind: 'history', pageId: message.pageId });
      break;
    case 'lockPage':
      if (phase.kind === 'ready') void getSession().lockPage(message.pageId);
      break;
    case 'unprotectPage':
      if (phase.kind === 'ready') void getSession().unprotectPage(message.pageId);
      break;
    case 'gradeCard': {
      if (phase.kind !== 'ready' || !reviews) break;
      const card = collectCards(getSession().getState()).find((item) => item.id === message.cardId);
      if (card) {
        reviews.grade(card, message.grade);
        report();
      }
      break;
    }
  }
}, {
  flush,
  pathOf: (id) => (phase.kind === 'ready' ? getSession().pathOf(id) : null),
  query,
  linkSelection,
  encryption,
});

// ctrl or cmd click on anything that points at a page opens it in a new tab, as morrow's tabs do
window.addEventListener(
  'click',
  (event) => {
    if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return;
    const id = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-page-id]')?.dataset.pageId;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    post({ type: 'openPage', pageId: id, newTab: true });
  },
  true,
);

// escape that nothing on the page used is the app's, it leaves focus mode
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) post({ type: 'shortcut', shortcut: 'escape' });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
