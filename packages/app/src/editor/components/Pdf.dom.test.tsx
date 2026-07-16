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
const getSelectedText = mock(() => ({
  wait: (resolve: (lines: string[]) => void) => resolve(['Selectable PDF text', 'Second line']),
}));
let endSelectionListener: (() => void) | null = null;
let selectionChangeListener: ((selection: unknown | null) => void) | null = null;

const selectionScope = {
  getSelectedText,
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
  useSharedPdfiumEngine: () => ({ engine: {}, loading: false, error: null }),
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
    provides: { forDocument: () => selectionScope },
  }),
  SelectionLayer: ({ pageIndex }: { pageIndex: number }) => (
    <div data-testid={`selection-page-${pageIndex + 1}`} />
  ),
}));

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
    getSelectedText.mockClear();
    endSelectionListener = null;
    selectionChangeListener = null;
  });

  afterEach(() => {
    cleanup();
    publishSelectionContext('assets/report.pdf', 'pdf', null);
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
});
