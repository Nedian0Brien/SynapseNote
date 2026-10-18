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
import { StrictMode, useEffect, useState } from 'react';
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
import { createPage, trashPage } from '../vendor/morrow/src/app/operations';
import { newId } from '../vendor/morrow/src/app/platform/files';
import { useUi } from '../vendor/morrow/src/app/ui';
import { getSession, setSession, useWorkspace } from '../vendor/morrow/src/app/workspace';
import { listen, post } from './bridge';
import type { Theme } from './bridge';
import { EditorApp } from './EditorApp';
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
let rerender: () => void = () => {};

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
    post({ type: 'workspace', pages: session.getState().pages, saveState: status.state, saveError: status.error });
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
  session.subscribe(report);
  session.queue.subscribe(report);
  phase = { kind: 'ready' };
  report();
  rerender();
}

function show(pageId: PageId | null): void {
  commitEditors();
  shown = pageId;
  showRoute(pageId);
  rerender();
}

async function flush(): Promise<boolean> {
  if (phase.kind !== 'ready') return true;
  commitEditors();
  return getSession().flush();
}

// which pages open in the text editor follows morrow's PageView: canvases and databases have views of their
// own, unreadable pages and pages with content this version does not know are never handed to the editor,
// because the editor would rewrite them in a form it understands
function Page({ pageId }: { pageId: PageId }) {
  const state = useWorkspace();
  const page = state.pages[pageId];
  const doc = state.docs[pageId];
  if (!page || !doc || isEffectivelyTrashed(state.pages, pageId)) return <Empty />;
  if (page.kind === 'canvas') return <Notice page={page} text="Canvases cannot be opened yet. The file is left as it is." />;
  if (page.kind === 'database')
    return <Notice page={page} text="Databases cannot be opened yet. The pages in it are listed in the sidebar." />;
  if (getSession().unreadable.has(pageId))
    return (
      <Notice
        page={page}
        text={
          page.encrypted
            ? 'This page is locked with a password. Opening locked pages is not available yet.'
            : 'The content of this page could not be read. It has been left untouched and is protected from changes.'
        }
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
  return <EditorApp key={pageId} page={page} doc={doc} editable />;
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
  return (
    <div className="view">
      {phase.kind === 'ready' && shown ? <Page pageId={shown} /> : <Empty />}
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

listen((message) => {
  switch (message.type) {
    case 'openVault':
      void openVault(message.name).catch((error: unknown) =>
        post({ type: 'vaultFailed', message: error instanceof Error ? error.message : String(error) }),
      );
      break;
    case 'show':
      show(message.pageId);
      break;
    case 'rpcResult':
      settle(message.id, message);
      break;
    case 'vaultChanges':
      deliverChanges(message.changes);
      break;
    case 'createPage': {
      if (phase.kind !== 'ready') break;
      const id = createPage({ parentId: message.parentId, open: false });
      if (id) post({ type: 'openPage', pageId: id });
      break;
    }
    case 'trashPage':
      if (phase.kind === 'ready') trashPage(message.pageId);
      break;
    case 'theme':
      applyTheme(message.theme);
      break;
  }
}, flush);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
