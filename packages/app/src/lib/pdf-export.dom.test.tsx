import { describe, expect, mock, test } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  annotatePdfBlockMath,
  annotatePdfMermaidCharts,
  applyPdfPreviewHeight,
  copyPdfCanvases,
  createPdfPrintRoot,
  materializePdfMath,
  PDF_BLOCK_MATH_FORMULA_ATTRIBUTE,
  PDF_MERMAID_CHART_ATTRIBUTE,
  pdfFilenameForDocument,
  preparePdfIframes,
  preparePdfImages,
  preparePdfStaticContent,
} from './pdf-export';

describe('pdf export print surface', () => {
  test('builds a safe PDF filename from document paths', () => {
    expect(pdfFilenameForDocument('guides/getting-started.md')).toBe('getting-started.pdf');
    expect(pdfFilenameForDocument('notes/Project: launch?.mdx')).toBe('Project- launch-.pdf');
    expect(pdfFilenameForDocument('')).toBe('Document.pdf');
  });

  test('clones rendered content and removes editing state', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit],
      content: '<h2>Overview</h2><p>Hello <strong>PDF</strong></p>',
    });
    const header = document.createElement('div');
    header.className = 'page-header';
    header.innerHTML = '<h1 contenteditable="true">Launch notes</h1>';
    editor.view.dom.firstElementChild?.setAttribute('data-drag-handle', '');
    editor.view.dom.firstElementChild?.setAttribute('data-selected', 'true');

    const root = createPdfPrintRoot({ docName: 'notes/launch', editor, pageHeader: header });

    expect(root.id).toBe('ok-pdf-export-root');
    expect(root.textContent).toContain('Launch notes');
    expect(root.textContent).toContain('Hello PDF');
    expect(root.querySelector('[contenteditable]')).toBeNull();
    expect(root.querySelector('[data-drag-handle]')).toBeNull();
    expect(root.querySelector('[data-selected]')).toBeNull();
    expect(root.querySelector('.ProseMirror')).not.toBeNull();
    expect(root.hasAttribute('aria-hidden')).toBe(false);
    expect(root.getAttribute('aria-label')).toBe('launch PDF export');
    editor.destroy();
  });

  test('expands disclosures, removes empty quotes, and preserves printable links', () => {
    const root = document.createElement('main');
    root.innerHTML = [
      '<details class="accordion"><summary>Backup</summary><div>Hidden evidence</div></details>',
      '<blockquote>   </blockquote>',
      '<blockquote><strong>Keep me</strong></blockquote>',
      '<a href="/research/source">Source</a>',
      '<span data-link href="https://example.com/paper" role="link" tabindex="0"><strong>Paper</strong></span>',
      '<table><tbody><tr><th>Metric</th><th>Value</th></tr><tr><td>Recall</td><td>0.9</td></tr></tbody></table>',
    ].join('');

    preparePdfStaticContent(root);

    const details = root.querySelector<HTMLDetailsElement>('details');
    expect(details?.open).toBe(true);
    expect(details?.hasAttribute('open')).toBe(true);
    expect(root.querySelectorAll('blockquote')).toHaveLength(1);
    expect(root.querySelector('blockquote')?.textContent).toContain('Keep me');
    const links = root.querySelectorAll<HTMLAnchorElement>('a');
    expect(links).toHaveLength(2);
    expect(links[0]?.href).toBe(new URL('/research/source', document.baseURI).href);
    expect(links[1]?.href).toBe('https://example.com/paper');
    expect(links[1]?.textContent).toBe('Paper');
    expect(root.querySelector('span[data-link]')).toBeNull();
    expect(root.querySelector('table > thead > tr > th')?.textContent).toBe('Metric');
    expect(root.querySelector('table > tbody > tr > td')?.textContent).toBe('Recall');
  });

  test('materializes block and inline formulas as static KaTeX markup', async () => {
    const root = document.createElement('main');
    const block = document.createElement('div');
    block.setAttribute(PDF_BLOCK_MATH_FORMULA_ATTRIBUTE, String.raw`A_\tau(R)=\tau\log R`);
    const inline = document.createElement('span');
    inline.dataset.componentType = 'math-inline';
    inline.dataset.formula = 'r_{leaf}';
    root.append(block, inline);

    await materializePdfMath(root);

    expect(block.querySelector('.math.math-display .katex-display')).not.toBeNull();
    expect(block.textContent).toContain('A');
    expect(inline.querySelector('.math.math-inline .katex')).not.toBeNull();
    expect(inline.textContent).toContain('leaf');
  });

  test('restores cloned block-math sources from the ProseMirror document', () => {
    const root = document.createElement('main');
    root.innerHTML = [
      '<div data-component-name="DollarMath" data-pdf-math-formula=""></div>',
      '<div data-component-name="MathFence" data-pdf-math-formula=""></div>',
    ].join('');
    const nodes = [
      {
        attrs: {
          componentName: 'DollarMath',
          props: { formula: String.raw`r_{document}(d,q)=\cos(E(q),E(d))` },
        },
      },
      {
        attrs: {
          componentName: 'MathFence',
          props: { formula: String.raw`A_\tau(R)=\tau\log R` },
        },
      },
    ];
    const editor = {
      state: {
        doc: {
          descendants: (visit: (node: (typeof nodes)[number]) => void) => {
            nodes.forEach(visit);
          },
        },
      },
    } as unknown as Editor;

    annotatePdfBlockMath(root, editor);

    const formulas = [...root.querySelectorAll<HTMLElement>('[data-pdf-math-formula]')].map(
      (element) => element.getAttribute(PDF_BLOCK_MATH_FORMULA_ATTRIBUTE),
    );
    expect(formulas).toEqual([
      String.raw`r_{document}(d,q)=\cos(E(q),E(d))`,
      String.raw`A_\tau(R)=\tau\log R`,
    ]);
  });

  test('restores Mermaid chart sources from the ProseMirror document', () => {
    const root = document.createElement('main');
    root.innerHTML = [
      '<div data-component-name="MermaidFence"></div>',
      '<div data-component-name="MermaidFence"></div>',
    ].join('');
    const nodes = [
      { attrs: { componentName: 'Math', props: { formula: 'x' } } },
      { attrs: { componentName: 'MermaidFence', props: { chart: 'flowchart LR\nA-->B' } } },
      {
        attrs: {
          componentName: 'MermaidFence',
          props: { chart: 'sequenceDiagram\nAlice->>Bob: Hello' },
        },
      },
    ];
    const editor = {
      state: {
        doc: {
          descendants: (visit: (node: (typeof nodes)[number]) => void) => nodes.forEach(visit),
        },
      },
    } as unknown as Editor;

    annotatePdfMermaidCharts(root, editor);

    expect(
      [...root.querySelectorAll<HTMLElement>(`[${PDF_MERMAID_CHART_ATTRIBUTE}]`)].map((element) =>
        element.getAttribute(PDF_MERMAID_CHART_ATTRIBUTE),
      ),
    ).toEqual(['flowchart LR\nA-->B', 'sequenceDiagram\nAlice->>Bob: Hello']);
  });

  test('forces cloned lazy images visible and removes their loading placeholder', () => {
    const root = document.createElement('main');
    root.innerHTML = [
      '<span data-testid="image-slot" class="relative aspect-[16/9] w-full max-w-full">',
      '  <span data-testid="image-loading-skeleton"></span>',
      '  <img loading="lazy" class="block opacity-0" src="/chart.png">',
      '</span>',
    ].join('');

    preparePdfImages(root);

    const image = root.querySelector('img');
    const slot = root.querySelector<HTMLElement>('[data-testid="image-slot"]');
    expect(root.querySelector('[data-testid="image-loading-skeleton"]')).toBeNull();
    expect(slot?.classList.contains('aspect-[16/9]')).toBe(false);
    expect(image?.loading).toBe('eager');
    expect(image?.fetchPriority).toBe('high');
    expect(image?.classList.contains('opacity-0')).toBe(false);
    expect(image?.style.opacity).toBe('1');
  });

  test('copies canvas backing pixels into the cloned print tree', () => {
    const source = document.createElement('div');
    const clone = document.createElement('div');
    const sourceCanvas = document.createElement('canvas');
    const targetCanvas = document.createElement('canvas');
    sourceCanvas.width = 640;
    sourceCanvas.height = 360;
    const drawImage = mock(() => undefined);
    Object.defineProperty(targetCanvas, 'getContext', {
      value: () => ({ drawImage }),
    });
    source.append(sourceCanvas);
    clone.append(targetCanvas);

    copyPdfCanvases(source, clone);

    expect(targetCanvas.width).toBe(640);
    expect(targetCanvas.height).toBe(360);
    expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0);
  });

  test('adds print-color preservation to sandboxed HTML previews', () => {
    const root = document.createElement('main');
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('srcdoc', '<div style="background:var(--chart-3)">Chart</div>');
    root.append(frame);

    preparePdfIframes(root);

    expect(frame.getAttribute('srcdoc')).toContain('data-ok-pdf-print-style');
    expect(frame.getAttribute('srcdoc')).toContain('-webkit-print-color-adjust: exact');
    expect(frame.getAttribute('srcdoc')).toContain('data-ok-pdf-height-reporter');
    expect(frame.getAttribute('srcdoc')).toContain('okPdfPreviewHeight');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.style.colorScheme).toBe('light');
  });

  test('expands a cloned HTML preview to its full reported content height', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'ok-codeblock-preview';
    wrapper.style.height = '120px';
    wrapper.style.maxHeight = '80vh';
    wrapper.style.overflow = 'hidden';
    const frame = document.createElement('iframe');
    wrapper.append(frame);

    applyPdfPreviewHeight(frame, 287.2);

    expect(wrapper.style.height).toBe('288px');
    expect(wrapper.style.maxHeight).toBe('none');
    expect(wrapper.style.overflow).toBe('visible');
    expect(frame.style.height).toBe('288px');
  });
});
