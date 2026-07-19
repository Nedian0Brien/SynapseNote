import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

type Registration = { packageName: string; config: Record<string, unknown> | undefined };
const registrations: Registration[] = [];
const scrollToPage = mock(() => {});
const zoomIn = mock(() => {});
const zoomOut = mock(() => {});
const requestZoom = mock(() => {});
const setSpreadMode = mock(() => {});
const createAnnotation = mock(() => {});
const selectAnnotation = mock(() => {});
const updateAnnotation = mock(() => {});
const deleteAnnotation = mock(() => {});
const navigateTarget = mock(() => ({ wait: (resolve: () => void) => resolve() }));
const getBookmarks = mock(() => ({
  wait: (resolve: (value: { bookmarks: unknown[] }) => void) =>
    resolve({
      bookmarks: [
        {
          title: 'Introduction',
          target: {
            type: 'destination',
            destination: { pageIndex: 0, zoom: { mode: 0 }, view: [] },
          },
        },
      ],
    }),
}));
const requestActiveTerminalInput = mock(() => {});
const savePdf = mock(async () => ({ ok: true }) as const);
const exportedPdfBytes = new TextEncoder().encode('%PDF-1.7\nannotated\n%%EOF\n');
const saveAsCopy = mock(() => ({
  toPromise: () => Promise.resolve(exportedPdfBytes.buffer),
}));
const originalFetch = globalThis.fetch;
const getSelectedText = mock(() => ({
  wait: (resolve: (lines: string[]) => void) => resolve(['Selectable PDF text', 'Second line']),
}));
let endSelectionListener: (() => void) | null = null;
let selectionChangeListener: ((selection: unknown | null) => void) | null = null;
let annotationEventListener: ((event: { type: string; committed?: boolean }) => void) | null = null;

const selectionScope = {
  getSelectedText,
  getFormattedSelection: () => [
    {
      pageIndex: 0,
      rect: { origin: { x: 10, y: 20 }, size: { width: 100, height: 20 } },
      segmentRects: [{ origin: { x: 10, y: 20 }, size: { width: 100, height: 20 } }],
    },
  ],
  getFormattedSelectionForPage: (pageIndex: number) =>
    pageIndex === 0
      ? {
          pageIndex: 0,
          rect: { origin: { x: 10, y: 20 }, size: { width: 100, height: 20 } },
          segmentRects: [{ origin: { x: 10, y: 20 }, size: { width: 100, height: 20 } }],
        }
      : null,
  clear: mock(() => {}),
  onEndSelection: (listener: () => void) => {
    endSelectionListener = listener;
    return () => {
      if (endSelectionListener === listener) endSelectionListener = null;
    };
  },
  onSelectionChange: (listener: (selection: unknown | null) => void) => {
    selectionChangeListener = listener;
    return () => {
      if (selectionChangeListener === listener) selectionChangeListener = null;
    };
  },
};
const selectionCapability = { forDocument: () => selectionScope };

const packageToken = (packageName: string) => ({ packageName });

mock.module('@embedpdf/core', () => ({
  createPluginRegistration: (
    pluginPackage: { packageName: string },
    config?: Record<string, unknown>,
  ) => {
    registrations.push({ packageName: pluginPackage.packageName, config });
    return { pluginPackage, config };
  },
}));

mock.module('@embedpdf/core/react', () => ({
  EmbedPDF: ({ children }: { children: ReactNode | ((state: unknown) => ReactNode) }) =>
    typeof children === 'function'
      ? children({ pluginsReady: true, activeDocumentId: 'test-pdf-document' })
      : children,
}));

mock.module('./pdfium-engine.ts', () => ({
  useSharedPdfiumEngine: () => ({ engine: { getBookmarks }, loading: false, error: null }),
}));

mock.module('@embedpdf/plugin-document-manager/react', () => ({
  DocumentManagerPluginPackage: packageToken('document-manager'),
  DocumentContent: ({
    children,
  }: {
    children: (state: {
      documentState: { document: { pages: unknown[] }; error: null };
      isLoading: boolean;
      isError: boolean;
      isLoaded: boolean;
    }) => ReactNode;
  }) =>
    children({
      documentState: { document: { pages: Array.from({ length: 20 }) }, error: null },
      isLoading: false,
      isError: false,
      isLoaded: true,
    }),
}));

mock.module('@embedpdf/plugin-viewport/react', () => ({
  ViewportPluginPackage: packageToken('viewport'),
  Viewport: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

mock.module('@embedpdf/plugin-scroll/react', () => ({
  ScrollPluginPackage: packageToken('scroll'),
  ScrollStrategy: { Vertical: 'vertical', Horizontal: 'horizontal' },
  useScroll: () => ({
    state: { currentPage: 1, totalPages: 20 },
    provides: { scrollToPage },
  }),
  Scroller: ({
    renderPage,
    className,
  }: {
    renderPage: (page: { pageIndex: number }) => ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="virtual-scroller">
      {renderPage({ pageIndex: 0 })}
      {renderPage({ pageIndex: 1 })}
    </div>
  ),
}));

mock.module('@embedpdf/plugin-interaction-manager/react', () => ({
  InteractionManagerPluginPackage: packageToken('interaction-manager'),
  GlobalPointerProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PagePointerProvider: ({
    children,
    className,
    style,
  }: {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
  }) => (
    <div className={className} style={style}>
      {children}
    </div>
  ),
}));

mock.module('@embedpdf/plugin-render/react', () => ({
  RenderPluginPackage: packageToken('render'),
  RenderLayer: ({ pageIndex }: { pageIndex: number }) => (
    <div data-testid={`render-page-${pageIndex + 1}`} />
  ),
}));

mock.module('@embedpdf/plugin-selection/react', () => ({
  SelectionPluginPackage: packageToken('selection'),
  useSelectionCapability: () => ({
    provides: selectionCapability,
  }),
  SelectionLayer: ({
    pageIndex,
    selectionMenu,
  }: {
    pageIndex: number;
    selectionMenu?: (props: Record<string, unknown>) => ReactNode;
  }) => (
    <div data-testid={`selection-page-${pageIndex + 1}`}>
      {pageIndex === 0 &&
        selectionMenu?.({
          rect: { origin: { x: 10, y: 20 }, size: { width: 100, height: 20 } },
          menuWrapperProps: {
            style: { position: 'absolute', width: 100, height: 20, pointerEvents: 'none' },
            ref: () => {},
          },
          selected: true,
          placement: { suggestTop: true, isVisible: true },
          context: { type: 'selection', pageIndex },
        })}
    </div>
  ),
}));

mock.module('@embedpdf/plugin-annotation/react', () => ({
  AnnotationPluginPackage: packageToken('annotation'),
  useAnnotation: () => ({
    state: {
      selectedUid: null,
      pages: { 0: ['highlight-1', 'memo-1', 'link-1'] },
      byUid: {
        'highlight-1': {
          object: {
            id: 'highlight-1',
            type: 9,
            contents: 'Important passage',
            strokeColor: '#facc15',
          },
        },
        'memo-1': {
          object: { id: 'memo-1', type: 1, contents: 'Research note', strokeColor: '#facc15' },
        },
        'link-1': {
          object: {
            id: 'link-1',
            type: 2,
            target: { type: 'action', action: { type: 3, uri: 'https://example.com' } },
          },
        },
      },
    },
    provides: {
      createAnnotation,
      selectAnnotation,
      updateAnnotation,
      deleteAnnotation,
      navigateTarget,
      onAnnotationEvent: (listener: (event: { type: string; committed?: boolean }) => void) => {
        annotationEventListener = listener;
        return () => {
          if (annotationEventListener === listener) annotationEventListener = null;
        };
      },
    },
  }),
  AnnotationLayer: ({
    pageIndex,
    selectionMenu,
  }: {
    pageIndex: number;
    selectionMenu?: (props: Record<string, unknown>) => ReactNode;
  }) => (
    <div data-testid={`annotation-page-${pageIndex + 1}`}>
      {selectionMenu?.({
        rect: { origin: { x: 30, y: 40 }, size: { width: 80, height: 16 } },
        menuWrapperProps: {
          style: { position: 'absolute', width: 80, height: 16, pointerEvents: 'none' },
          ref: () => {},
        },
        selected: false,
        placement: { suggestTop: false },
        context: {
          type: 'annotation',
          pageIndex,
          annotation: {
            object: { id: `annotation-${pageIndex}`, type: 9, contents: '' },
          },
          structurallyLocked: false,
          contentLocked: false,
        },
      })}
    </div>
  ),
}));

mock.module('@embedpdf/plugin-export/react', () => ({
  ExportPluginPackage: packageToken('export'),
  useExport: () => ({ provides: { saveAsCopy, download: () => {} } }),
}));

mock.module('@/components/handoff/compose-terminal-selection', () => ({
  composeTerminalSelectionPaste: (docName: string, text: string) => `${docName}:${text}`,
}));

mock.module('@/components/handoff/terminal-input-events', () => ({ requestActiveTerminalInput }));

mock.module('@embedpdf/plugin-zoom/react', () => ({
  ZoomPluginPackage: packageToken('zoom'),
  ZoomMode: { Automatic: 'automatic', FitPage: 'fit-page', FitWidth: 'fit-width' },
  useZoom: () => ({
    state: { currentZoomLevel: 1, zoomLevel: 'fit-width', isMarqueeZoomActive: false },
    provides: { zoomIn, zoomOut, requestZoom },
  }),
}));

mock.module('@embedpdf/plugin-spread/react', () => ({
  SpreadPluginPackage: packageToken('spread'),
  SpreadMode: { None: 'none', Odd: 'odd', Even: 'even' },
  useSpread: () => ({ spreadMode: 'none', provides: { setSpreadMode } }),
}));

mock.module('@embedpdf/plugin-thumbnail/react', () => ({
  ThumbnailPluginPackage: packageToken('thumbnail'),
  ThumbnailsPane: ({
    children,
    className,
  }: {
    children: (meta: unknown) => ReactNode;
    className?: string;
  }) => (
    <div className={className}>
      {children({
        pageIndex: 0,
        width: 112,
        height: 148,
        wrapperHeight: 174,
        top: 0,
        labelHeight: 18,
      })}
    </div>
  ),
  ThumbImg: () => <div data-testid="thumbnail-image" />,
}));

const { getSelectionContext, publishSelectionContext } = await import('../selection-context');
const { Pdf } = await import('./Pdf');

describe('EmbedPDF viewer integration', () => {
  beforeEach(() => {
    registrations.length = 0;
    scrollToPage.mockClear();
    zoomIn.mockClear();
    zoomOut.mockClear();
    requestZoom.mockClear();
    setSpreadMode.mockClear();
    createAnnotation.mockClear();
    selectAnnotation.mockClear();
    updateAnnotation.mockClear();
    deleteAnnotation.mockClear();
    navigateTarget.mockClear();
    getBookmarks.mockClear();
    requestActiveTerminalInput.mockClear();
    savePdf.mockClear();
    saveAsCopy.mockClear();
    getSelectedText.mockClear();
    endSelectionListener = null;
    selectionChangeListener = null;
    annotationEventListener = null;
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, 'okDesktop', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    publishSelectionContext('assets/report.pdf', 'pdf', null);
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, 'okDesktop', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  test('virtualizes rendered pages and publishes geometry selection to chat context', async () => {
    render(
      <Pdf
        src="/api/asset?path=assets%2Freport.pdf"
        title="report.pdf"
        selectionDocumentName="assets/report.pdf"
      />,
    );

    await screen.findByTestId('virtual-scroller');
    expect(screen.getByTestId('render-page-1')).not.toBeNull();
    expect(screen.getByTestId('render-page-2')).not.toBeNull();
    expect(screen.queryByTestId('render-page-3')).toBeNull();
    expect(document.querySelector('.ok-pdf-text-layer')).toBeNull();

    const scrollRegistration = registrations.find(({ packageName }) => packageName === 'scroll');
    const selectionRegistration = registrations.find(
      ({ packageName }) => packageName === 'selection',
    );
    expect(scrollRegistration?.config).toMatchObject({ defaultBufferSize: 2 });
    expect(selectionRegistration?.config).toMatchObject({
      maxCachedGeometries: 12,
      marquee: { enabled: false },
    });

    act(() => endSelectionListener?.());
    await waitFor(() =>
      expect(getSelectionContext('assets/report.pdf', 'pdf')).toMatchObject({
        surface: 'pdf',
        docName: 'assets/report.pdf',
        markdown: 'Selectable PDF text\nSecond line',
        lineCount: 2,
      }),
    );

    act(() => selectionChangeListener?.(null));
    expect(getSelectionContext('assets/report.pdf', 'pdf')).toBeNull();
  });

  test('copies the dragged PDF selection with the native copy shortcut event', async () => {
    render(<Pdf src="/api/asset?path=assets%2Freport.pdf" title="report.pdf" />);

    await screen.findByTestId('virtual-scroller');
    const pages = document.querySelector<HTMLElement>('.ok-pdf-pages');
    expect(pages).not.toBeNull();

    fireEvent.pointerDown(pages as HTMLElement);
    expect(document.activeElement).toBe(pages);

    const setData = mock(() => {});
    fireEvent.copy(pages as HTMLElement, { clipboardData: { setData } });
    expect(setData).not.toHaveBeenCalled();

    act(() => endSelectionListener?.());
    await waitFor(() => expect(getSelectedText).toHaveBeenCalledTimes(1));

    fireEvent.copy(pages as HTMLElement, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith('text/plain', 'Selectable PDF text\nSecond line');
  });

  test('shows PDF-only selection actions and wires highlight, memo, and Ask AI', async () => {
    Object.defineProperty(window, 'okDesktop', {
      value: { shell: { savePdf } },
      writable: true,
      configurable: true,
    });
    render(
      <Pdf
        src="/api/asset?path=assets%2Freport.pdf"
        title="report.pdf"
        selectionDocumentName="assets/report.pdf"
      />,
    );

    await screen.findByTestId('pdf-selection-menu');
    const selectionMenu = screen.getByTestId('pdf-selection-menu');
    expect(selectionMenu.style.pointerEvents).toBe('auto');
    expect(selectionMenu.style.bottom).toBe('calc(100% + 8px)');
    expect(selectionMenu.parentElement?.style.pointerEvents).toBe('none');
    expect(selectionMenu.parentElement?.classList.contains('bg-background')).toBe(false);
    expect(screen.queryByTestId('pdf-annotation-menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Memo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask AI' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Italic' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();

    act(() => endSelectionListener?.());
    await waitFor(() => expect(getSelectedText).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    await waitFor(() =>
      expect(requestActiveTerminalInput).toHaveBeenCalledWith(
        'assets/report.pdf:Selectable PDF text\nSecond line',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    expect(createAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ type: 9, pageIndex: 0, strokeColor: '#facc15' }),
    );
    act(() => annotationEventListener?.({ type: 'create', committed: true }));
    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    expect(savePdf.mock.calls[0]?.[0]).toBe('assets/report.pdf');
    expect(savePdf.mock.calls[0]?.[1]).toBeInstanceOf(Uint8Array);

    fireEvent.click(screen.getByRole('button', { name: 'Memo' }));
    fireEvent.change(screen.getByLabelText('PDF memo'), { target: { value: 'Key finding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save memo' }));
    expect(createAnnotation).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ type: 1, pageIndex: 0, contents: 'Key finding' }),
    );
    expect(selectAnnotation).toHaveBeenCalledTimes(1);
  });

  test('keeps page, zoom, layout, and thumbnail controls wired to viewer plugins', async () => {
    render(<Pdf src="/api/asset?path=assets%2Freport.pdf" title="report.pdf" anchor="page=4" />);

    await screen.findByTestId('virtual-scroller');
    await waitFor(() =>
      expect(scrollToPage).toHaveBeenCalledWith({
        pageNumber: 4,
        behavior: 'instant',
        alignY: 0,
      }),
    );

    const pageInput = screen.getByLabelText('Page number');
    fireEvent.change(pageInput, { target: { value: '10' } });
    fireEvent.submit(pageInput.closest('form') as HTMLFormElement);
    expect(scrollToPage).toHaveBeenLastCalledWith({
      pageNumber: 10,
      behavior: 'instant',
      alignY: 0,
    });

    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(zoomIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Layout options'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Fit height' }));
    expect(setSpreadMode).toHaveBeenCalledWith('none');
    await waitFor(() => expect(requestZoom).toHaveBeenCalledWith('fit-page'));

    fireEvent.click(screen.getByLabelText('Show thumbnails'));
    expect(await screen.findByTestId('thumbnail-image')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Jump to page 1'));
    expect(scrollToPage).toHaveBeenLastCalledWith({
      pageNumber: 1,
      behavior: 'instant',
      alignY: 0,
    });
  });

  test('exposes the shared right-panel toggle in the route-level PDF toolbar', async () => {
    const onToggleRightPanel = mock(() => {});
    const view = render(
      <Pdf
        src="/api/asset?path=assets%2Freport.pdf"
        title="report.pdf"
        rightPanelOpen={false}
        onToggleRightPanel={onToggleRightPanel}
      />,
    );

    await screen.findByTestId('virtual-scroller');
    fireEvent.click(screen.getByRole('button', { name: 'Show panel' }));
    expect(onToggleRightPanel).toHaveBeenCalledTimes(1);

    view.rerender(
      <Pdf
        src="/api/asset?path=assets%2Freport.pdf"
        title="report.pdf"
        rightPanelOpen
        onToggleRightPanel={onToggleRightPanel}
      />,
    );
    expect(screen.getByRole('button', { name: 'Hide panel' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  test('portals Pages, Annotations, Outline, and Links into the route-level PDF rail', async () => {
    const panelContainer = document.createElement('div');
    document.body.append(panelContainer);
    const commonProps = {
      src: '/api/asset?path=assets%2Freport.pdf',
      title: 'report.pdf',
      fillContainer: true,
      panelContainer,
    };
    const view = render(<Pdf {...commonProps} activePanelTab="pages" />);

    expect((await screen.findAllByTestId('thumbnail-image')).length).toBe(20);
    expect(panelContainer.querySelector('.ok-pdf-pages-grid')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Jump to page 1'));
    expect(scrollToPage).toHaveBeenLastCalledWith({
      pageNumber: 1,
      behavior: 'instant',
      alignY: 0,
    });

    view.rerender(<Pdf {...commonProps} activePanelTab="annotations" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Highlight on page 1' }));
    expect(selectAnnotation).toHaveBeenCalledWith(0, 'highlight-1');

    view.rerender(<Pdf {...commonProps} activePanelTab="outline" />);
    expect(await screen.findByText('Outline')).not.toBeNull();
    expect(screen.getByText('1')).not.toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Introduction' }));
    expect(navigateTarget).toHaveBeenCalledWith(expect.objectContaining({ type: 'destination' }));

    view.rerender(<Pdf {...commonProps} activePanelTab="links" />);
    expect(await screen.findByText('External links')).not.toBeNull();
    expect(screen.getByText('Backlinks')).not.toBeNull();
    expect(screen.getByText('Memos')).not.toBeNull();
    fireEvent.click(await screen.findByTitle('https://example.com'));
    expect(navigateTarget).toHaveBeenCalledWith(expect.objectContaining({ type: 'action' }));
    fireEvent.click(screen.getByRole('button', { name: /Research note/ }));
    expect(selectAnnotation).toHaveBeenLastCalledWith(0, 'memo-1');

    panelContainer.remove();
  });

  test('loads backlinks for the PDF asset and groups them with external links and memos', async () => {
    const fetchBacklinks = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/api/backlinks?docName=assets%2Freport.pdf');
      return new Response(
        JSON.stringify({
          docName: 'assets/report.pdf',
          backlinks: [
            {
              source: 'notes/research',
              anchor: null,
              title: 'Research note',
              snippet: 'This note cites the PDF.',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    globalThis.fetch = fetchBacklinks as typeof fetch;
    const panelContainer = document.createElement('div');
    document.body.append(panelContainer);

    render(
      <Pdf
        src="/api/asset?path=assets%2Freport.pdf"
        title="report.pdf"
        fillContainer
        selectionDocumentName="assets/report.pdf"
        panelContainer={panelContainer}
        activePanelTab="links"
      />,
    );

    expect(await screen.findByText('Research note')).not.toBeNull();
    expect(screen.getByText('This note cites the PDF.')).not.toBeNull();
    expect(fetchBacklinks).toHaveBeenCalledTimes(1);
    panelContainer.remove();
  });

  test('uses a full-width standalone tool row instead of a floating PDF control pill', async () => {
    const { container } = render(
      <Pdf
        src="/api/asset?path=assets%2Freport.pdf"
        title="report.pdf"
        rightPanelOpen
        onToggleRightPanel={() => {}}
      />,
    );

    await screen.findByTestId('virtual-scroller');
    const toolbar = container.querySelector('.ok-pdf-toolbar--standalone');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.classList.contains('ok-pdf-toolbar--floating')).toBe(false);
    expect(container.querySelector('.ok-pdf-body--standalone')).not.toBeNull();
  });
});
