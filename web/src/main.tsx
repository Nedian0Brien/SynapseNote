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
import { displayTitle, emptyDoc } from '../vendor/morrow/src/core/model';
import type { PageId } from '../vendor/morrow/src/core/model';
import { findUnknownTypes } from '../vendor/morrow/src/core/doc';
import { isEffectivelyTrashed } from '../vendor/morrow/src/core/tree';
import { WorkspaceSession } from '../vendor/morrow/src/storage/session';
import type { ExternalPatch } from '../vendor/morrow/src/storage/repository';
import { SourceDialog } from '../vendor/morrow/src/app/components/SourceDialog';
import { commitEditors } from '../vendor/morrow/src/app/editor/commits';
import {
  createFromTemplate,
  createPage,
  captureToToday,
  createTemplatesPage,
  deleteUnusedFiles,
  exportAllMarkdown,
  exportBackup,
  exportPageMarkdown,
  importMarkdown,
  openToday,
  publishSite,
  restoreBackup,
  restoreVersion,
  saveAsTemplate,
  trashPage,
  unusedFiles,
} from '../vendor/morrow/src/app/operations';
import { loadCustomCss, previewCustomCss, saveCustomCss, useCustomCss } from '../vendor/morrow/src/app/customCss';
import { setPreferences } from '../vendor/morrow/src/app/platform/preferences';
import { sampleCommands } from '../vendor/morrow/src/core/sample';
import { createBackup } from '../vendor/morrow/src/core/portability';
import { parseDateKey } from '../vendor/morrow/src/core/daily';
import { findTemplatesPage } from '../vendor/morrow/src/core/templates';
import { newId } from '../vendor/morrow/src/app/platform/files';
import { useUi } from '../vendor/morrow/src/app/ui';
import { getSession, run, runAll, setSession, useWorkspace } from '../vendor/morrow/src/app/workspace';
import { listen, post } from './bridge';
import type { Theme, ToastMessage, ViewPreferences } from './bridge';
import { EditorApp, linkSelection } from './EditorApp';
import type { FindRequest } from './EditorApp';
import * as queries from './queries';
import { createReviews } from './review';
import { createDeltas } from './stateDelta';
import type { Reviews } from './review';
import { collectCards } from '../vendor/morrow/src/core/flashcards';
import { HistoryDialog } from '../vendor/morrow/src/app/components/HistoryDialog';
import { closeDialog, dismissToast, getUi, openDialog, setUi, toast } from '../vendor/morrow/src/app/ui';
import type { Toast } from '../vendor/morrow/src/app/ui';
import { showRoute } from './host/router';
import { settle } from './host/rpc';
import { ReplicaRepository, sendCommands } from './host/replica';
import type { VaultInfo } from './host/replica';

const root = document.documentElement;
const applyTheme = (theme: Theme) => {
  root.dataset.theme = theme;
};
applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
root.dataset.accent = 'ocean';
root.dataset.colorful = 'true';

// the app's settings, kept in morrow's preferences so morrow's components read them as they do there
function applyPreferences(preferences: ViewPreferences): void {
  setPreferences(preferences);
  root.dataset.accent = preferences.accent;
  root.dataset.colorful = preferences.colorful ? 'true' : 'false';
}

// errors in the page are reported to the native app, which logs them
window.addEventListener('error', (event) => post({ type: 'log', level: 'error', message: String(event.message) }));
window.addEventListener('unhandledrejection', (event) =>
  post({ type: 'log', level: 'error', message: String(event.reason) }),
);

type Phase = { kind: 'waiting' } | { kind: 'ready' };

// state outside react, so messages that arrive before the first render are not lost
let phase: Phase = { kind: 'waiting' };
let shown: PageId | null = null;
// the page the app's own editor shows (App/Sources/Editor)
let nativeEditor: PageId | null = null;
let find: FindRequest | null = null;
let findCount = 0;
let rerender: () => void = () => {};
// flashcard progress for the open vault
let reviews: Reviews | null = null;
// the open vault's storage, the app's session behind it
let replica: ReplicaRepository | null = null;
// the app compares this page's workspace with its own session (debug builds), from the state deltas sent for it
let compareWithApp = false;

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
    // the app compares this copy of the workspace with its own session; it goes first, since the comparison
    // runs when the workspace message arrives
    if (compareWithApp) {
      const delta = deltas.next({
        state: session.getState(),
        unreadable: session.unreadable,
        activity: session.activity(),
        reviewLog: reviews?.log() ?? {},
      });
      if (delta) post({ type: 'state', json: JSON.stringify(delta) });
    }
    post({
      type: 'workspace',
      pages,
      locked: [...session.unreadable].filter((id) => pages[id]?.encrypted),
      sourceMode: getUi().sourceMode,
      saveState: status.state,
      saveError: status.error,
    });
  }, 16);
}

const deltas = createDeltas();

async function openVault(name: string, guide: boolean, compare: boolean): Promise<void> {
  if (phase.kind !== 'waiting') return;
  const repository = new ReplicaRepository(name);
  const opened = await WorkspaceSession.open(repository);
  if (!opened.ok) {
    post({ type: 'vaultFailed', message: opened.error });
    return;
  }
  const session = opened.value;
  replica = repository;
  compareWithApp = compare;
  // every command applied here is applied by the app's session too, which writes the vault
  sendCommands(session);
  // keystrokes still waiting in an editor are saved before an outside edit is read
  session.beforeExternal = commitEditors;
  // morrow's welcome guide in a vault opened for the first time; never in a folder about to be filled from
  // another device, as morrow's main.tsx
  if (session.firstRun && guide) {
    const seeded = session.executeAll(sampleCommands(newId, Date.now()));
    if (seeded.ok) await session.flush();
  }
  await session.markInitialized();
  setSession(session);
  deltas.reset();
  reviews = createReviews({ read: () => session.readMeta('review.json'), write: (text) => session.writeMeta('review.json', text) });
  await reviews.load();
  session.subscribe(report);
  session.queue.subscribe(report);
  phase = { kind: 'ready' };
  report();
  rerender();
  startAutoBackup();
  await loadCustomCss();
}

// an edit another app made, read by the app's session: morrow's session saves the open editors, keeps pages
// with unsaved changes, and the app commits only what was taken in here
function takeExternal(id: number, json: string): void {
  if (phase.kind !== 'ready') {
    post({ type: 'log', level: 'warning', message: 'An outside edit arrived before the vault was open.' });
    post({ type: 'externalAccepted', id, accepted: [] });
    return;
  }
  const accepted = getSession().applyExternal(JSON.parse(json) as ExternalPatch);
  post({ type: 'externalAccepted', id, accepted });
}

// the app's session refused a command applied here, its version of those pages replaces this one
async function takeResync(json: string): Promise<void> {
  if (phase.kind !== 'ready') return;
  await getSession().flush();
  getSession().applyExternal(JSON.parse(json) as ExternalPatch);
  post({ type: 'log', level: 'error', message: 'Pages were set back to what the app saved.' });
}

// morrow's automatic backup on the desktop: once half a minute after opening, then every ten minutes, and
// before the app closes, only when a page changed since the last one. the files of a vault are on disk as
// they are, so it holds the pages without attachments, as morrow's does for a vault
const AUTO_BACKUP_MS = 10 * 60 * 1000;
let lastAutoBackup = 0;
function autoBackup(): void {
  if (phase.kind !== 'ready') return;
  commitEditors();
  const state = getSession().getState();
  const latest = Math.max(0, ...Object.values(state.pages).map((page) => page.updatedAt));
  if (latest <= lastAutoBackup) return;
  lastAutoBackup = latest;
  post({ type: 'autoBackup', json: JSON.stringify(createBackup(state, new Date(), [])) });
}

function startAutoBackup(): void {
  setTimeout(autoBackup, 30_000);
  setInterval(autoBackup, AUTO_BACKUP_MS);
}

function show(pageId: PageId | null, text: string | null): void {
  commitEditors();
  // morrow's dialogs cover the whole window; here the sidebar and search stay usable, so a page's dialog closes when another page opens
  if (pageId !== shown) closeDialog();
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

// a find request is used once; an editor made again for the same page, such as after unlocking it, starts plain
function clearFind(): void {
  find = null;
}

async function flush(): Promise<boolean> {
  if (phase.kind !== 'ready') return true;
  commitEditors();
  await reviews?.flush();
  const saved = await getSession().flush();
  autoBackup();
  return saved;
}

// the open page as it looks, for the app to print into a pdf as morrow's desktop app does; its stylesheets
// come along so the print styles apply. the clone keeps what the editor drew, pictures included
function pdfSnapshot(id: string): string | null {
  if (phase.kind !== 'ready' || shown !== id) return null;
  const page = getSession().getState().pages[id];
  const article = document.querySelector('.view .page');
  if (!page || !article) return null;
  commitEditors();
  const head = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join('\n');
  return JSON.stringify({
    title: displayTitle(page),
    head,
    body: `<div id="root"><div class="view"><div class="page-scroll">${withFormState(article).outerHTML}</div></div></div>`,
    accent: root.dataset.accent ?? 'ocean',
    colorful: root.dataset.colorful ?? 'true',
  });
}

// a copy of the element to print: form fields show what is typed and ticked now, where markup alone keeps
// only what they started with, so a ticked task would print unticked
// morrow's images and files section of the settings: how many files the vault holds, their size, and how many
// no page, trashed page or page version uses
async function files(): Promise<string | null> {
  if (phase.kind !== 'ready') return null;
  const [all, unused] = await Promise.all([getSession().listFiles(), unusedFiles()]);
  return JSON.stringify({ count: all.length, bytes: all.reduce((sum, file) => sum + file.size, 0), unused: unused.length });
}

function withFormState(element: Element): Element {
  const copy = element.cloneNode(true) as Element;
  // pictures that wait until they are scrolled to would never load in the page the app prints
  copy.querySelectorAll('img[loading="lazy"]').forEach((image) => image.removeAttribute('loading'));
  const live = element.querySelectorAll('input, textarea, select');
  const copied = copy.querySelectorAll('input, textarea, select');
  live.forEach((field, index) => {
    const target = copied[index];
    if (!target) return;
    if (field instanceof HTMLInputElement) {
      if (field.checked) target.setAttribute('checked', '');
      else target.removeAttribute('checked');
      target.setAttribute('value', field.value);
    } else if (field instanceof HTMLTextAreaElement) {
      target.textContent = field.value;
    } else if (field instanceof HTMLSelectElement) {
      target.querySelectorAll('option').forEach((option, at) => option.toggleAttribute('selected', at === field.selectedIndex));
    }
  });
  return copy;
}

// morrow's toasts as the app shows them; the app draws them above its own screens, which cover this page
function toastMessages(toasts: Toast[]): ToastMessage[] {
  return toasts.map((entry) => ({
    id: entry.id,
    message: entry.message,
    tone: entry.tone,
    action: entry.action?.label ?? null,
  }));
}

function runToastAction(id: number): void {
  const entry = getUi().toasts.find((item) => item.id === id);
  entry?.action?.run();
  dismissToast(id);
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
// because the editor would rewrite them in a form it understands. the app draws those pages, a locked one
// and a page shown as its markdown source itself (PageScreen in App/Sources/Pages), over an empty page here
const EMPTY_DOC = emptyDoc();

function Page({ pageId, find }: { pageId: PageId; find: FindRequest | null }) {
  const state = useWorkspace();
  const { sourceMode } = useUi();
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
  if (!page || isEffectivelyTrashed(state.pages, pageId)) return <Empty />;
  // the app draws a canvas page itself (App/Sources/Canvas)
  if (page.kind === 'canvas') return <Empty />;
  // the app draws a database page itself (App/Sources/Database)
  if (page.kind === 'database') return <Empty />;
  // in morrow's order: a page that could not be read, the markdown source of a text page, then content this
  // version does not know; a page without a document yet, such as a folder without a note, starts empty
  if (getSession().unreadable.has(pageId)) return <Empty />;
  if (sourceMode === pageId && page.kind === 'page') return <Empty />;
  const text = doc ?? EMPTY_DOC;
  if (findUnknownTypes(text).length > 0) return <Empty />;
  // the app draws this page in its own editor
  if (nativeEditor === pageId) return <Empty />;
  return <EditorApp key={pageId} page={page} doc={text} editable find={find} onFound={clearFind} />;
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
  useEffect(() => {
    post({ type: 'toasts', toasts: toastMessages(ui.toasts) });
  }, [ui.toasts]);
  useEffect(() => {
    if (phase.kind === 'ready') report();
  }, [ui.sourceMode]);
  // the vault's custom css, for the app's settings, once the vault is open and whenever it is read or saved;
  // an empty file reads as the same empty text, so the vault opening is told too
  const customCss = useCustomCss();
  const ready = phase.kind === 'ready';
  useEffect(() => {
    if (ready) post({ type: 'customCss', css: customCss });
  }, [customCss, ready]);
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
    </div>
  );
}

listen((message) => {
  switch (message.type) {
    case 'openVault':
      void openVault(message.name, message.guide, message.compare).catch((error: unknown) =>
        post({ type: 'vaultFailed', message: error instanceof Error ? error.message : String(error) }),
      );
      break;
    case 'show':
      show(message.pageId, message.find);
      break;
    case 'rpcResult':
      settle(message.id, message);
      break;
    case 'external':
      takeExternal(message.id, message.json);
      break;
    case 'vaultInfo':
      replica?.absorb(JSON.parse(message.json) as VaultInfo);
      break;
    case 'resync':
      void takeResync(message.json);
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
    case 'commands':
      if (phase.kind === 'ready') runAll(message.commands);
      break;
    case 'theme':
      applyTheme(message.theme);
      break;
    case 'preferences':
      applyPreferences(message.preferences);
      break;
    case 'previewCss':
      previewCustomCss(message.css);
      break;
    case 'saveCss':
      // morrow's custom css setting: saved and shown at once, a toast either way
      if (phase.kind === 'ready')
        void saveCustomCss(message.css)
          .then(() => toast('Custom CSS saved.'))
          .catch(() => toast('Could not save the CSS.', { tone: 'error' }));
      break;
    case 'capture':
      // morrow's CaptureDialog
      if (phase.kind === 'ready' && captureToToday(message.text)) toast("Added to today's note.");
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
    // the app's history dialog chose a version; the page restores it, as it holds the workspace
    case 'restoreVersion':
      if (phase.kind === 'ready') {
        void getSession()
          .listSnapshots(message.pageId)
          .then((versions) => {
            const version = versions.find((candidate) => candidate.id === message.snapshotId);
            if (version) void restoreVersion(version);
          });
      }
      break;
    case 'lockPage':
      if (phase.kind === 'ready') void getSession().lockPage(message.pageId);
      break;
    case 'unprotectPage':
      if (phase.kind === 'ready') void getSession().unprotectPage(message.pageId);
      break;
    case 'exportMarkdown':
      if (phase.kind === 'ready') void exportPageMarkdown(message.pageId);
      break;
    case 'publish':
      if (phase.kind === 'ready') void publishSite(message.pageId);
      break;
    case 'exportAll':
      if (phase.kind === 'ready') void exportAllMarkdown();
      break;
    case 'backup':
      if (phase.kind === 'ready') void exportBackup();
      break;
    case 'restore':
      if (phase.kind === 'ready') void restoreBackup();
      break;
    case 'importMarkdown':
      if (phase.kind === 'ready') void importMarkdown(message.parentId);
      break;
    case 'deleteUnusedFiles':
      if (phase.kind === 'ready') void deleteUnusedFiles();
      break;
    case 'setSourceMode':
      commitEditors();
      setUi({ sourceMode: message.pageId });
      break;
    case 'nativeEditor':
      commitEditors();
      nativeEditor = message.pageId;
      rerender();
      break;
    case 'toastAction':
      runToastAction(message.id);
      break;
    case 'dismissToast':
      dismissToast(message.id);
      break;
    case 'gradeCard': {
      if (phase.kind !== 'ready' || !reviews) break;
      const card = collectCards(getSession().getState()).find((item) => item.id === message.cardId);
      if (card) {
        reviews.grade(card, message.grade);
        // the app answers its screens from its own copy of the progress; the file follows after the delay
        post({ type: 'reviewLog', json: JSON.stringify(reviews.log()) });
        report();
      }
      break;
    }
  }
}, {
  flush,
  query,
  linkSelection,
  encryption,
  pdfSnapshot,
  files,
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
