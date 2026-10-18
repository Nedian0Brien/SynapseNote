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
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DocNode, PageId } from '../vendor/morrow/src/core/model';
import { listen, post } from './bridge';
import type { Theme } from './bridge';
import { EditorApp } from './EditorApp';
import { setState } from './host/pages';

interface Loaded {
  pageId: PageId;
  doc: DocNode;
  editable: boolean;
  // counts loads so reopening the same page builds a fresh editor
  serial: number;
}

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

let setLoaded: (loaded: Loaded) => void = () => {};
let flush: () => void = () => {};
let serial = 0;

function Host() {
  const [loaded, set] = useState<Loaded | null>(null);
  setLoaded = set;
  if (!loaded) return null;
  return (
    <EditorApp
      key={`${loaded.pageId}:${loaded.serial}`}
      pageId={loaded.pageId}
      doc={loaded.doc}
      editable={loaded.editable}
      onFlushReady={(next) => {
        flush = next;
      }}
    />
  );
}

listen((message) => {
  switch (message.type) {
    case 'load': {
      flush();
      setState(message.state);
      setLoaded({
        pageId: message.pageId,
        doc: message.state.docs[message.pageId]!,
        editable: message.editable,
        serial: ++serial,
      });
      break;
    }
    case 'theme':
      applyTheme(message.theme);
      break;
    case 'flush':
      flush();
      break;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
post({ type: 'ready' });
