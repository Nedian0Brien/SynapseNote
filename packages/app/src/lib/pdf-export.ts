import type { Editor } from '@tiptap/core';

const PDF_PRINT_ROOT_ID = 'ok-pdf-export-root';
export const PDF_BLOCK_MATH_FORMULA_ATTRIBUTE = 'data-pdf-math-formula';
export const PDF_MERMAID_CHART_ATTRIBUTE = 'data-pdf-mermaid-chart';
const PDF_BLOCK_MATH_SELECTOR = [
  '[data-component-name="Math"]',
  '[data-component-name="DollarMath"]',
  '[data-component-name="MathFence"]',
].join(',');
const PDF_MERMAID_SELECTOR = '[data-component-name="MermaidFence"]';
const PDF_PREVIEW_HEIGHT_MESSAGE_KEY = 'okPdfPreviewHeight';

const MARKDOWN_EXTENSION = /\.(?:md|mdx)$/i;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const PDF_IFRAME_PRINT_STYLE = `<style data-ok-pdf-print-style>
@media print {
  html, body, body * {
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }
}
</style>`;
const PDF_IFRAME_HEIGHT_REPORTER = `<script data-ok-pdf-height-reporter>
(function () {
  var raf;
  function report() {
    var d = document.documentElement;
    var b = document.body;
    if (!d || !b) return;
    var box = b.getBoundingClientRect();
    var height = Math.max(d.scrollHeight, b.scrollHeight, box.bottom);
    parent.postMessage({ ${PDF_PREVIEW_HEIGHT_MESSAGE_KEY}: Math.ceil(height) }, '*');
  }
  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(report);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
  addEventListener('load', schedule);
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(document.documentElement);
})();
</script>`;

export type PdfExportResult =
  | { kind: 'saved'; path: string }
  | { kind: 'canceled' }
  | { kind: 'print-dialog' }
  | { kind: 'failed'; reason: 'print-failed' | 'write-failed' | 'invalid-pdf' };

/** Produce a cross-platform, filesystem-safe default without changing the source document. */
export function pdfFilenameForDocument(docName: string): string {
  const basename = docName.split(/[\\/]/).at(-1)?.replace(MARKDOWN_EXTENSION, '') ?? '';
  const safe = [...basename]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(INVALID_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return `${safe || 'Document'}.pdf`;
}

function makePrintSafe(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[contenteditable]').forEach((element) => {
    element.removeAttribute('contenteditable');
  });
  root.querySelectorAll<HTMLElement>('[tabindex]').forEach((element) => {
    element.removeAttribute('tabindex');
  });
  root.querySelectorAll<HTMLElement>('[aria-selected="true"]').forEach((element) => {
    element.removeAttribute('aria-selected');
  });
  root.querySelectorAll<HTMLElement>('[data-drag-handle]').forEach((element) => {
    // Top-level JSX component wrappers themselves carry this attribute; it
    // is not just an overlay handle. Keeping it in the print clone lets the
    // print stylesheet hide the entire component, including block math.
    element.removeAttribute('data-drag-handle');
    element.removeAttribute('draggable');
  });
  root
    .querySelectorAll<HTMLElement>(
      '[data-selected], [data-has-child-selected], [data-range-selected], [data-selection-origin], [data-dragging]',
    )
    .forEach((element) => {
      element.removeAttribute('data-selected');
      element.removeAttribute('data-has-child-selected');
      element.removeAttribute('data-range-selected');
      element.removeAttribute('data-selection-origin');
      element.removeAttribute('data-dragging');
    });
  root
    .querySelectorAll<HTMLElement>(
      [
        '.ProseMirror-selectednode',
        '.selectedCell',
        '.ok-find-match',
        '.ok-find-match-active',
        '.ok-memo-highlight-active',
      ].join(','),
    )
    .forEach((element) => {
      element.classList.remove(
        'ProseMirror-selectednode',
        'selectedCell',
        'ok-find-match',
        'ok-find-match-active',
        'ok-memo-highlight-active',
      );
    });
}

/**
 * Turn interactive editor output into a complete, static document before
 * Chromium paginates it. A PDF has no useful collapsed state, so disclosure
 * widgets must expose their contents. Empty authoring-only quote blocks are
 * removed rather than leaving a stray rule on the page.
 */
export function preparePdfStaticContent(root: HTMLElement): void {
  root.querySelectorAll<HTMLDetailsElement>('details').forEach((details) => {
    details.open = true;
    details.setAttribute('open', '');
  });

  root.querySelectorAll<HTMLElement>('blockquote').forEach((blockquote) => {
    const hasRenderableContent = blockquote.querySelector(
      'img, svg, canvas, iframe, table, details, [data-component-name], [data-component-type]',
    );
    if (!blockquote.textContent?.trim() && !hasRenderableContent) blockquote.remove();
  });

  // The interactive editor intentionally renders Markdown links as
  // `<span role="link" data-link href="…">` chips so its delegated click
  // handler can route internal and external destinations. Chromium only
  // writes clickable PDF annotations for real anchors, so restore native
  // anchor semantics in the detached print clone.
  root.querySelectorAll<HTMLElement>('[data-link][href]').forEach((linkChip) => {
    if (linkChip.tagName === 'A') return;
    const anchor = document.createElement('a');
    for (const attribute of linkChip.attributes) {
      if (attribute.name === 'role' || attribute.name === 'tabindex') continue;
      anchor.setAttribute(attribute.name, attribute.value);
    }
    anchor.append(...linkChip.childNodes);
    linkChip.replaceWith(anchor);
  });

  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    try {
      anchor.setAttribute('href', new URL(href, document.baseURI).href);
    } catch {
      // Keep non-URL schemes and malformed author text intact. Chromium can
      // still print the visible label even when it cannot create an annotation.
    }
  });

  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (table.tHead) return;
    const firstRow = table.querySelector<HTMLTableRowElement>(':scope > tbody > tr:first-child');
    if (!firstRow || [...firstRow.cells].some((cell) => cell.tagName !== 'TH')) return;
    const head = document.createElement('thead');
    head.append(firstRow);
    table.prepend(head);
  });
}

/**
 * The live React NodeView can render a formula even when its DOM data
 * attribute is empty during the deep-clone boundary. Re-read the canonical
 * source from the ProseMirror document and pair it with cloned math wrappers
 * in document order before replacing their portal-backed contents.
 */
export function annotatePdfBlockMath(root: HTMLElement, editor: Editor): void {
  const formulas: string[] = [];
  editor.state.doc.descendants((node) => {
    const componentName = node.attrs?.componentName;
    if (
      componentName !== 'Math' &&
      componentName !== 'DollarMath' &&
      componentName !== 'MathFence'
    ) {
      return;
    }
    const props = node.attrs?.props as { formula?: unknown } | undefined;
    formulas.push(typeof props?.formula === 'string' ? props.formula : '');
  });

  const targets = root.querySelectorAll<HTMLElement>(PDF_BLOCK_MATH_SELECTOR);
  targets.forEach((target, index) => {
    const formula = formulas[index];
    if (formula !== undefined) {
      target.setAttribute(PDF_BLOCK_MATH_FORMULA_ATTRIBUTE, formula);
    }
  });
}

/**
 * Restore Mermaid source on the print clone from the ProseMirror document.
 * The live NodeView may still be rendering (or carry an interactive pan/zoom
 * transform), so its current SVG is not a stable print source.
 */
export function annotatePdfMermaidCharts(root: HTMLElement, editor: Editor): void {
  const charts: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.attrs?.componentName !== 'MermaidFence') return;
    const props = node.attrs?.props as { chart?: unknown } | undefined;
    charts.push(typeof props?.chart === 'string' ? props.chart : '');
  });

  root.querySelectorAll<HTMLElement>(PDF_MERMAID_SELECTOR).forEach((target, index) => {
    const chart = charts[index];
    if (chart !== undefined) target.setAttribute(PDF_MERMAID_CHART_ATTRIBUTE, chart);
  });
}

/**
 * React NodeView portals are not guaranteed to survive a deep DOM clone.
 * Rebuild math from its source attributes so the print tree always contains
 * static KaTeX markup, independently of the editor's lazy-render lifecycle.
 */
export async function materializePdfMath(root: HTMLElement): Promise<void> {
  const blockMath = [
    ...root.querySelectorAll<HTMLElement>(`[${PDF_BLOCK_MATH_FORMULA_ATTRIBUTE}]`),
  ];
  const inlineMath = [
    ...root.querySelectorAll<HTMLElement>('[data-component-type="math-inline"][data-formula]'),
  ];
  if (blockMath.length === 0 && inlineMath.length === 0) return;

  const { default: katex } = await import('katex');
  const render = (target: HTMLElement, formula: string, displayMode: boolean) => {
    const host = document.createElement(displayMode ? 'div' : 'span');
    host.className = displayMode ? 'math math-display' : 'math math-inline';
    host.dataset.componentType = displayMode ? 'math' : 'math-inline';
    host.innerHTML = katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
    target.replaceChildren(host);
  };

  for (const target of blockMath) {
    render(target, target.getAttribute(PDF_BLOCK_MATH_FORMULA_ATTRIBUTE) ?? '', true);
  }
  for (const target of inlineMath) {
    render(target, target.dataset.formula ?? '', false);
  }
}

/**
 * Render every Mermaid block again with a print-safe light theme. This avoids
 * exporting an empty async placeholder, the editor's dark theme, or the
 * reader's current interactive zoom/pan transform.
 */
async function materializePdfMermaid(root: HTMLElement): Promise<void> {
  const targets = [...root.querySelectorAll<HTMLElement>(`[${PDF_MERMAID_CHART_ATTRIBUTE}]`)];
  if (targets.length === 0) return;

  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
    suppressErrorRendering: true,
  });

  for (const [index, target] of targets.entries()) {
    const chart = target.getAttribute(PDF_MERMAID_CHART_ATTRIBUTE) ?? '';
    if (!chart.trim()) continue;
    try {
      const { svg } = await mermaid.render(`ok-pdf-mermaid-${index}-${Date.now()}`, chart);
      const diagram = document.createElement('div');
      diagram.className = 'ok-pdf-mermaid-static';
      const svgHost = document.createElement('div');
      svgHost.className = 'ok-mermaid-svg';
      svgHost.innerHTML = svg;
      diagram.append(svgHost);
      target.replaceChildren(diagram);
    } catch {
      // Preserve the already-rendered clone as a graceful fallback. Remove
      // interaction chrome and pan/zoom transforms below so it still prints
      // as closely as possible to its canonical resting state.
    }
  }

  root.querySelectorAll<HTMLElement>('[data-testid="mermaid-actions"]').forEach((element) => {
    element.remove();
  });
  root.querySelectorAll<SVGElement>('[data-component-type="mermaid"] svg').forEach((svg) => {
    svg.style.removeProperty('transform');
    svg.removeAttribute('transform');
  });
}

/**
 * A deep clone freezes LoadingImage's React state. Force cloned images to
 * load eagerly and make the underlying image visible instead of printing the
 * pre-load skeleton forever.
 */
export function preparePdfImages(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>('[data-testid="image-loading-skeleton"]')
    .forEach((element) => {
      element.remove();
    });
  root.querySelectorAll<HTMLElement>('[data-testid="image-slot"]').forEach((slot) => {
    slot.classList.remove('aspect-[16/9]', 'w-full', 'max-w-full');
    slot.style.removeProperty('aspect-ratio');
  });
  root.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.loading = 'eager';
    image.fetchPriority = 'high';
    image.classList.remove('opacity-0');
    image.classList.add('opacity-100');
    image.style.setProperty('opacity', '1');
    image.style.setProperty('visibility', 'visible');
  });
}

/** Canvas bitmaps are not copied by cloneNode. Copy their backing pixels. */
export function copyPdfCanvases(source: HTMLElement, clone: HTMLElement): void {
  const sources = source.querySelectorAll<HTMLCanvasElement>('canvas');
  const targets = clone.querySelectorAll<HTMLCanvasElement>('canvas');
  targets.forEach((target, index) => {
    const sourceCanvas = sources[index];
    if (!sourceCanvas) return;
    target.width = sourceCanvas.width;
    target.height = sourceCanvas.height;
    const context = target.getContext('2d');
    if (!context) return;
    try {
      context.drawImage(sourceCanvas, 0, 0);
    } catch {
      // A tainted or GPU-only canvas cannot be copied through 2D. Leaving the
      // cloned canvas in place is safer than failing the whole PDF export.
    }
  });
}

/** Prepare sandboxed HTML previews to paint their authored backgrounds. */
export function preparePdfIframes(root: HTMLElement): void {
  root.querySelectorAll<HTMLIFrameElement>('iframe[srcdoc]').forEach((frame) => {
    const srcdoc = frame.getAttribute('srcdoc') ?? '';
    const printStyle = srcdoc.includes('data-ok-pdf-print-style') ? '' : PDF_IFRAME_PRINT_STYLE;
    const heightReporter = srcdoc.includes('data-ok-pdf-height-reporter')
      ? ''
      : PDF_IFRAME_HEIGHT_REPORTER;
    frame.setAttribute('srcdoc', `${srcdoc}\n${printStyle}${heightReporter}`);
    frame.style.setProperty('color-scheme', 'light');
  });
}

function parsePdfPreviewHeight(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const height = (data as Record<string, unknown>)[PDF_PREVIEW_HEIGHT_MESSAGE_KEY];
  return typeof height === 'number' && Number.isFinite(height) && height > 0
    ? Math.ceil(height)
    : null;
}

/** Expand a cloned HTML preview to its complete rendered document height. */
export function applyPdfPreviewHeight(frame: HTMLIFrameElement, height: number): void {
  const wrapper = frame.closest<HTMLElement>('.ok-codeblock-preview');
  if (!wrapper || !Number.isFinite(height) || height <= 0) return;
  const roundedHeight = Math.ceil(height);
  wrapper.style.setProperty('height', `${roundedHeight}px`);
  wrapper.style.setProperty('max-height', 'none');
  wrapper.style.setProperty('overflow', 'visible');
  frame.style.setProperty('height', `${roundedHeight}px`);
}

/**
 * Clone the already-rendered editor into a print-only body sibling. Keeping the
 * clone in the same document preserves the editor's real typography and rich
 * block styling while excluding every piece of application chrome.
 */
export function createPdfPrintRoot(args: {
  docName: string;
  editor: Editor;
  pageHeader?: HTMLElement | null;
}): HTMLElement {
  const root = document.createElement('main');
  root.id = PDF_PRINT_ROOT_ID;
  root.setAttribute(
    'aria-label',
    `${pdfFilenameForDocument(args.docName).replace(/\.pdf$/i, '')} PDF export`,
  );
  root.dataset.documentName = args.docName;

  const article = document.createElement('article');
  article.className = 'ok-pdf-export-document';

  if (args.pageHeader) {
    article.append(args.pageHeader.cloneNode(true));
  } else {
    const title = document.createElement('h1');
    title.className = 'ok-pdf-export-title';
    title.textContent = pdfFilenameForDocument(args.docName).replace(/\.pdf$/i, '');
    article.append(title);
  }

  const editorClone = args.editor.view.dom.cloneNode(true) as HTMLElement;
  editorClone.removeAttribute('contenteditable');
  editorClone.removeAttribute('spellcheck');
  annotatePdfBlockMath(editorClone, args.editor);
  annotatePdfMermaidCharts(editorClone, args.editor);
  preparePdfImages(editorClone);
  preparePdfIframes(editorClone);
  copyPdfCanvases(args.editor.view.dom, editorClone);
  article.append(editorClone);
  root.append(article);
  preparePdfStaticContent(root);
  makePrintSafe(root);
  return root;
}

async function waitForPrintAssets(root: HTMLElement): Promise<void> {
  const fonts = document.fonts?.ready.catch(() => undefined) ?? Promise.resolve();
  const images = [...root.querySelectorAll('img')].map(async (image) => {
    if (image.complete) {
      await image.decode?.().catch(() => undefined);
      return;
    }
    await new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  });
  const frames = [...root.querySelectorAll<HTMLIFrameElement>('iframe')].map(
    (frame) =>
      new Promise<void>((resolve) => {
        let finished = false;
        const onMessage = (event: MessageEvent) => {
          if (event.source !== frame.contentWindow) return;
          const height = parsePdfPreviewHeight(event.data);
          if (height !== null) applyPdfPreviewHeight(frame, height);
        };
        window.addEventListener('message', onMessage);
        const finish = () => {
          if (finished) return;
          finished = true;
          // The live React NodeView normally sends this after load. The print
          // clone has no React lifecycle, so send it here to keep its tokenized
          // chart colors legible on the PDF's white paper.
          frame.contentWindow?.postMessage({ okPreviewTheme: 'light' }, '*');
          window.setTimeout(() => {
            window.removeEventListener('message', onMessage);
            resolve();
          }, 250);
        };
        frame.addEventListener('load', finish, { once: true });

        // cloneNode copies iframe attributes but not its browsing context.
        // Reassign the authored source after the listener is attached so
        // srcdoc charts and other embedded previews create a fresh context,
        // run their scripts, and reach load before Chromium snapshots pages.
        const srcdoc = frame.getAttribute('srcdoc');
        if (srcdoc !== null) {
          frame.srcdoc = srcdoc;
        } else {
          const src = frame.getAttribute('src');
          if (src) frame.src = src;
          else finish();
        }
      }),
  );
  await Promise.race([
    Promise.all([fonts, ...images, ...frames]),
    new Promise<void>((resolve) => window.setTimeout(resolve, 8000)),
  ]);
}

/** Mount, export, and always remove the transient print surface. */
export async function exportRenderedDocumentToPdf(args: {
  docName: string;
  editor: Editor;
  pageHeader?: HTMLElement | null;
}): Promise<PdfExportResult> {
  document.getElementById(PDF_PRINT_ROOT_ID)?.remove();
  const root = createPdfPrintRoot(args);
  const previousTitle = document.title;
  const suggestedName = pdfFilenameForDocument(args.docName);
  root.classList.add('ok-pdf-export-preparing');
  document.body.append(root);
  document.body.classList.add('ok-pdf-exporting');
  document.title = suggestedName.replace(/\.pdf$/i, '');

  try {
    await materializePdfMath(root);
    await materializePdfMermaid(root);
    await waitForPrintAssets(root);
    root.classList.remove('ok-pdf-export-preparing');
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const bridge = window.okDesktop;
    if (!bridge?.dialog.exportPdf) {
      window.print();
      return { kind: 'print-dialog' };
    }
    const result = await bridge.dialog.exportPdf(suggestedName);
    if (result.ok) {
      return result.canceled
        ? { kind: 'canceled' }
        : { kind: 'saved', path: result.path ?? suggestedName };
    }
    return { kind: 'failed', reason: result.reason };
  } finally {
    document.title = previousTitle;
    document.body.classList.remove('ok-pdf-exporting');
    root.remove();
  }
}
