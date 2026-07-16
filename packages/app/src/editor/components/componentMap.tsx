/**
 * Maps component name → React component for the descriptor registry.
 *
 * Canonical pack: Callout + Image + Video + Audio + Accordion + Math + MermaidFence + Pdf + File + Tabs + Tab.
 * Each canonical entry is a DIY renderer — Callout is a 7-prop GFM shape
 * at `./Callout`, Image wraps `react-medium-image-zoom` (8-prop at
 * `./Image`), Video is a pure HTML5 `<video>` wrapper (9-prop at `./Video`
 * — no URL sniffing, no iframe emission), Audio is a pure HTML5
 * `<audio>` wrapper (7-prop at `./Audio`, `hasChildren: true` for
 * `<source>` / `<track>` passthrough), Accordion is a standalone HTML5
 * `<details>`/`<summary>` wrapper (6-prop at `./Accordion`
 * — no `variant`, no `<Accordions>` parent wrapper; cross-browser exclusive
 * grouping via HTML5 `<details name>`), Math is a KaTeX-lazy renderer at
 * `./Math`, MermaidFence is a mermaid-js v11 lazy renderer at `./Mermaid`
 * (re-introduces support that was removed — replaces the
 * placeholder stub deleted; the descriptor
 * is named `MermaidFence` so `<Mermaid />` JSX falls through to the
 * wildcard, enforcing fence-only authoring), Pdf is a
 * EmbedPDF/PDFium-backed virtualized viewer with our own toolbar
 * (3-prop shape at `./Pdf`; `anchor`-string parsed at render time for
 * `#page=N` / `#height=N` viewer parameters), and File is a generic
 * file-attachment row (1-prop canonical at `./File`; styled `<a>`
 * link with icon + filename + optional dim size — Notion-style inline
 * row, no card chrome). PDFium and the viewer plugins are lazy-loaded and the
 * WASM engine is shared across mounted PDF views.
 *
 * Compound-component machinery (Tabs/Tab + Accordions/Accordion)
 * was cut along with the Context Bridge Registry. Tabs/Tab
 * returned with an ephemeral-state design: `Tabs.tsx`'s
 * `useState(activeIndex)` plus a single `data-active-index` attribute on
 * the content wrapper drive CSS-only panel visibility — no cross-NodeView
 * React context, no DOM mutation on PM-managed children. Tab and Tabs are
 * the canonical pack's only compound parent today (Tabs declares
 * `emptyChildName: 'Tab'`).
 *
 * Descriptor names no longer in `componentMap` — Banner, Card, Cards, Step,
 * Steps, Accordions (fumadocs compound parent), Files, Folder, TypeTable,
 * InlineTOC — fall through to the `'*'` wildcard per
 * `registry/index.ts:getDescriptor`. Per-Precedent #30 the children of those
 * unregistered components stay editable (wildcard `hasChildren: true`).
 *
 * '*' maps to UnregisteredBadgeRender for the wildcard fallback.
 */
import { useDocumentContext } from '@/editor/DocumentContext';
import { Accordion } from './Accordion.tsx';
import { Audio } from './Audio.tsx';
import { Callout } from './Callout.tsx';
import { Embed } from './Embed.tsx';
import { File } from './File.tsx';
import { Image } from './Image.tsx';
import { MathView } from './Math.tsx';
import { MermaidView } from './Mermaid.tsx';
import { Mirror } from './Mirror.tsx';
import { MirrorSource } from './MirrorSource.tsx';
import { Pdf } from './Pdf.tsx';
import { Tab } from './Tab.tsx';
import { Tabs } from './Tabs.tsx';
import { Video } from './Video.tsx';

function UnregisteredBadgeRender(props: { children?: React.ReactNode }) {
  return <div className="prose-no-margin">{props.children}</div>;
}

/** Inline PDFs belong to the active markdown document. Supplying that identity
 * lets their geometry-backed selection publish directly into both Ask AI composer
 * variants without adding document-context coupling to the reusable Pdf view. */
function DocumentPdf(props: React.ComponentProps<typeof Pdf>) {
  const { activeDocName } = useDocumentContext();
  return <Pdf {...props} selectionDocumentName={activeDocName ?? undefined} />;
}

// biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across the canonical pack + transitional shim imports; no single prop type covers all
export const componentMap: Record<string, React.ComponentType<any>> = {
  Callout,
  // Lowercase media canonicals — descriptor names mirror their HTML
  // primitives (`img` / `video` / `audio`); React component file names
  // stay PascalCase per React convention. The split lives only at this
  // registration boundary.
  img: Image,
  video: Video,
  audio: Audio,
  // `Pdf` is capitalized because there is NO `<pdf>` HTML element — it
  // follows the same React JSX convention as `Callout` and `Accordion`
  // (capital for non-native components). Same dispatch shape as the
  // media canonicals. Renders via lazily loaded EmbedPDF/PDFium.
  Pdf: DocumentPdf,
  // `File` is capitalized for the same reason — no `<file>` HTML element.
  // Renders as a styled `<a>` inline row; covers every dropped attachment
  // including PDF (the wikilink form `![[doc.pdf]]` routes here too —
  // explicit `<Pdf>` JSX is the opt-in path for the bundled PDF viewer).
  File,
  // `Embed` is capitalized — no `<embed>` semantic match (HTML's
  // `<embed>` is for legacy plugin objects, not the iframe pattern).
  // Renders via a cross-origin iframe with `referrerPolicy="no-referrer"`.
  Embed,
  Accordion,
  Tabs,
  Tab,
  Math: MathView,
  // Descriptor name is `MermaidFence` (not `Mermaid`) so legacy
  // `<Mermaid chart="…" />` JSX content falls through to the wildcard
  // `'*'` (raw-mdx editable source block) — fence-only authoring.
  MermaidFence: MermaidView,
  // Master/copy block transclusion. `MirrorSource` is the editable
  // source-of-truth wrapper; `Mirror` is the read-only consumer that
  // resolves a `<MirrorSource id="…">` from another doc via the shared
  // refcounted provider pool in `useMirrorSource`.
  Mirror,
  MirrorSource,
  '*': UnregisteredBadgeRender,
};
