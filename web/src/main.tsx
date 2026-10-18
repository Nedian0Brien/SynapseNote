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

// the latest page to show, kept outside react so a load that arrives before the first render is not lost
let latest: Loaded | null = null;
let show: (loaded: Loaded) => void = (loaded) => {
  latest = loaded;
};
let flush: () => void = () => {};
let serial = 0;

function Host() {
  const [loaded, setLoaded] = useState<Loaded | null>(latest);
  useEffect(() => {
    show = (next) => {
      latest = next;
      setLoaded(next);
    };
    if (latest) setLoaded(latest);
    // the app sends the first page only after this, once the host can show it
    post({ type: 'ready' });
  }, []);
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
      show({
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
