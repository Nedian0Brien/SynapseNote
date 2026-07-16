/**
 * Virtualized, selectable PDF viewer powered by EmbedPDF/PDFium.
 *
 * Unlike PDF.js' browser-native text layer, text selection here is resolved
 * from cached PDF glyph geometry. Only visible page render layers and selection
 * rectangles are mounted, so fast scrolling does not traverse or rebuild a
 * large tree of transparent text spans on the main thread.
 */

import { createPluginRegistration, type PluginBatchRegistrations } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react';
import {
  GlobalPointerProvider,
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import {
  Scroller,
  ScrollPluginPackage,
  ScrollStrategy,
  useScroll,
} from '@embedpdf/plugin-scroll/react';
import {
  SelectionLayer,
  SelectionPluginPackage,
  useSelectionCapability,
} from '@embedpdf/plugin-selection/react';
import { SpreadMode, SpreadPluginPackage, useSpread } from '@embedpdf/plugin-spread/react';
import {
  ThumbImg,
  type ThumbMeta,
  ThumbnailPluginPackage,
  ThumbnailsPane,
} from '@embedpdf/plugin-thumbnail/react';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { useZoom, ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';
import { toDesktopAssetHref } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { Check, ChevronDown, PanelLeft, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { publishSelectionContext, selectionSnapshotFromPdf } from '@/editor/selection-context';
import { useSharedPdfiumEngine } from './pdfium-engine.ts';

export interface PdfEmbedProps {
  src: string;
  title?: string;
  targetPage: number | null;
  selectionDocumentName?: string;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

type PdfLayoutMode = 'fit-width' | 'fit-height' | 'single' | 'two-odd' | 'two-even';

export function PdfEmbed(props: PdfEmbedProps) {
  const reactId = useId();
  const documentId = `ok-pdf-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const documentUrl = toDesktopAssetHref(props.src);
  const { engine, loading, error } = useSharedPdfiumEngine();

  const [plugins] = useState<PluginBatchRegistrations>(() => [
    createPluginRegistration(DocumentManagerPluginPackage, {
      maxDocuments: 1,
      initialDocuments: [
        {
          url: documentUrl,
          documentId,
          name: props.title ?? 'PDF',
          mode: 'auto',
          autoActivate: true,
        },
      ],
    }),
    createPluginRegistration(ViewportPluginPackage, { viewportGap: 12 }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultStrategy: ScrollStrategy.Vertical,
      defaultPageGap: 8,
      defaultBufferSize: 2,
    }),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitWidth,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      zoomStep: ZOOM_STEP,
    }),
    createPluginRegistration(SpreadPluginPackage, {
      defaultSpreadMode: SpreadMode.None,
    }),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(SelectionPluginPackage, {
      marquee: { enabled: false },
      minSelectionDragDistance: 2,
      toleranceFactor: 1.5,
      maxCachedGeometries: 12,
    }),
    createPluginRegistration(ThumbnailPluginPackage, {
      width: 112,
      gap: 8,
      buffer: 3,
      labelHeight: 18,
      imagePadding: 2,
      paddingY: 8,
      autoScroll: true,
      scrollBehavior: 'instant',
    }),
  ]);

  if (error) {
    return <PdfStatus title={props.title} error={error.message} />;
  }
  if (loading || !engine) {
    return <PdfStatus title={props.title} />;
  }

  return (
    <EmbedPDF key={documentUrl} engine={engine} plugins={plugins}>
      {({ pluginsReady, activeDocumentId }) => {
        if (!pluginsReady || !activeDocumentId) return <PdfStatus title={props.title} />;
        return (
          <DocumentContent documentId={activeDocumentId}>
            {({ documentState, isLoading, isError, isLoaded }) => {
              if (isError) {
                return (
                  <PdfStatus
                    title={props.title}
                    error={documentState.error ?? 'Unknown PDF error'}
                  />
                );
              }
              if (isLoading || !isLoaded || !documentState.document) {
                return <PdfStatus title={props.title} />;
              }
              return (
                <LoadedPdf
                  documentId={activeDocumentId}
                  title={props.title}
                  totalPages={documentState.document.pages.length}
                  targetPage={props.targetPage}
                  selectionDocumentName={props.selectionDocumentName}
                />
              );
            }}
          </DocumentContent>
        );
      }}
    </EmbedPDF>
  );
}

interface LoadedPdfProps {
  documentId: string;
  title?: string;
  totalPages: number;
  targetPage: number | null;
  selectionDocumentName?: string;
}

function LoadedPdf(props: LoadedPdfProps) {
  const { t } = useLingui();
  const { state: scrollState, provides: scroll } = useScroll(props.documentId);
  const { state: zoomState, provides: zoom } = useZoom(props.documentId);
  const { spreadMode, provides: spread } = useSpread(props.documentId);
  const { provides: selection } = useSelectionCapability();
  const initialPage = clampPage(props.targetPage ?? 1, props.totalPages);
  const initialPageApplied = useRef(false);
  const layoutZoomFrame = useRef<number | null>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const [pageInputDraft, setPageInputDraft] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<PdfLayoutMode>('fit-width');
  const [showThumbs, setShowThumbs] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const currentPage = clampPage(scrollState.currentPage, props.totalPages);
  const pageInputValue = pageInputDraft ?? String(currentPage);

  useEffect(() => {
    if (initialPageApplied.current || !scroll) return;
    initialPageApplied.current = true;
    scroll.scrollToPage({ pageNumber: initialPage, behavior: 'instant', alignY: 0 });
  }, [initialPage, scroll]);

  useEffect(() => {
    if (!layoutMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!layoutMenuRef.current?.contains(event.target as Node | null)) {
        setLayoutMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [layoutMenuOpen]);

  useEffect(() => {
    const documentName = props.selectionDocumentName;
    if (!documentName || !selection) return;
    const scope = selection.forDocument(props.documentId);
    let publishGeneration = 0;

    const publishSelectedText = () => {
      publishGeneration = publishGeneration + 1;
      const generation = publishGeneration;
      scope.getSelectedText().wait(
        (lines) => {
          if (generation !== publishGeneration) return;
          publishSelectionContext(
            documentName,
            'pdf',
            selectionSnapshotFromPdf(lines.join('\n'), documentName),
          );
        },
        () => {
          if (generation === publishGeneration) {
            publishSelectionContext(documentName, 'pdf', null);
          }
        },
      );
    };

    const stopEnd = scope.onEndSelection(publishSelectedText);
    const stopChange = scope.onSelectionChange((nextSelection) => {
      if (nextSelection === null) {
        publishGeneration += 1;
        publishSelectionContext(documentName, 'pdf', null);
      }
    });
    return () => {
      publishGeneration += 1;
      stopEnd();
      stopChange();
    };
  }, [props.documentId, props.selectionDocumentName, selection]);

  useEffect(
    () => () => {
      if (layoutZoomFrame.current !== null) cancelAnimationFrame(layoutZoomFrame.current);
    },
    [],
  );

  const goToPage = (page: number) => {
    const clamped = clampPage(page, props.totalPages);
    setPageInputDraft(null);
    scroll?.scrollToPage({ pageNumber: clamped, behavior: 'instant', alignY: 0 });
  };

  const submitPageInput = () => {
    const page = Number.parseInt(pageInputValue, 10);
    if (Number.isNaN(page)) {
      setPageInputDraft(null);
      return;
    }
    goToPage(page);
  };

  const selectLayout = (mode: PdfLayoutMode) => {
    setLayoutMode(mode);
    setLayoutMenuOpen(false);

    const nextSpread =
      mode === 'two-odd' ? SpreadMode.Odd : mode === 'two-even' ? SpreadMode.Even : SpreadMode.None;
    const nextZoom =
      mode === 'fit-width' || mode === 'two-odd' || mode === 'two-even'
        ? ZoomMode.FitWidth
        : mode === 'fit-height'
          ? ZoomMode.FitPage
          : 1;

    spread?.setSpreadMode(nextSpread);
    if (layoutZoomFrame.current !== null) cancelAnimationFrame(layoutZoomFrame.current);
    layoutZoomFrame.current = requestAnimationFrame(() => {
      layoutZoomFrame.current = null;
      zoom?.requestZoom(nextZoom);
    });
  };

  const activeLayoutMode: PdfLayoutMode =
    spreadMode === SpreadMode.Odd
      ? 'two-odd'
      : spreadMode === SpreadMode.Even
        ? 'two-even'
        : layoutMode;
  const zoomPercent = Math.round(zoomState.currentZoomLevel * 100);

  return (
    <>
      <div className="ok-pdf-toolbar" contentEditable={false}>
        <button
          type="button"
          onClick={() => setShowThumbs((visible) => !visible)}
          aria-label={showThumbs ? t`Hide thumbnails` : t`Show thumbnails`}
          aria-pressed={showThumbs}
          className="ok-pdf-btn"
          title={t`Toggle thumbnails`}
        >
          <PanelLeft size={14} aria-hidden="true" />
        </button>
        <span className="ok-pdf-title">{props.title ?? 'PDF'}</span>
        <div className="ok-pdf-controls">
          <form
            className="ok-pdf-page-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitPageInput();
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="ok-pdf-page-input"
              value={pageInputValue}
              onChange={(event) => setPageInputDraft(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={submitPageInput}
              aria-label={t`Page number`}
            />
          </form>
          <span className="ok-pdf-page-of">
            <Trans>of {props.totalPages}</Trans>
          </span>

          <span className="ok-pdf-divider" aria-hidden="true" />

          <button
            type="button"
            onClick={() => zoom?.zoomOut()}
            disabled={!zoom || zoomState.currentZoomLevel <= ZOOM_MIN}
            aria-label={t`Zoom out`}
            className="ok-pdf-btn"
            title={t`Zoom out`}
          >
            <ZoomOut size={14} aria-hidden="true" />
          </button>
          <span className="ok-pdf-zoom-display" aria-live="polite">
            {zoomPercent}%
          </span>
          <button
            type="button"
            onClick={() => zoom?.zoomIn()}
            disabled={!zoom || zoomState.currentZoomLevel >= ZOOM_MAX}
            aria-label={t`Zoom in`}
            className="ok-pdf-btn"
            title={t`Zoom in`}
          >
            <ZoomIn size={14} aria-hidden="true" />
          </button>

          <span className="ok-pdf-divider" aria-hidden="true" />

          <div ref={layoutMenuRef} className="ok-pdf-layout-menu">
            <button
              type="button"
              onClick={() => setLayoutMenuOpen((open) => !open)}
              aria-label={t`Layout options`}
              aria-haspopup="menu"
              aria-expanded={layoutMenuOpen}
              className="ok-pdf-btn"
              title={t`Layout`}
            >
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {layoutMenuOpen && (
              <div role="menu" className="ok-pdf-menu">
                <LayoutMenuItem
                  label={t`Fit width`}
                  active={activeLayoutMode === 'fit-width'}
                  onSelect={() => selectLayout('fit-width')}
                />
                <LayoutMenuItem
                  label={t`Fit height`}
                  active={activeLayoutMode === 'fit-height'}
                  onSelect={() => selectLayout('fit-height')}
                />
                <hr className="ok-pdf-menu-divider" />
                <LayoutMenuItem
                  label={t`Single page`}
                  active={activeLayoutMode === 'single'}
                  onSelect={() => selectLayout('single')}
                />
                <LayoutMenuItem
                  label={t`Two-page (odd)`}
                  active={activeLayoutMode === 'two-odd'}
                  onSelect={() => selectLayout('two-odd')}
                />
                <LayoutMenuItem
                  label={t`Two-page (even)`}
                  active={activeLayoutMode === 'two-even'}
                  onSelect={() => selectLayout('two-even')}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ok-pdf-body">
        {showThumbs && (
          <ThumbnailsPane
            documentId={props.documentId}
            className="ok-pdf-sidebar"
            aria-label={t`Page thumbnails`}
          >
            {(meta: ThumbMeta) => {
              const pageNumber = meta.pageIndex + 1;
              return (
                <button
                  type="button"
                  key={meta.pageIndex}
                  className="ok-pdf-thumb"
                  style={{ top: meta.top, height: meta.wrapperHeight }}
                  data-active={currentPage === pageNumber || undefined}
                  onClick={() => goToPage(pageNumber)}
                  aria-label={t`Jump to page ${pageNumber}`}
                >
                  <ThumbImg
                    documentId={props.documentId}
                    meta={meta}
                    aria-hidden="true"
                    draggable={false}
                    className="ok-pdf-thumb-image"
                    style={{ width: meta.width, height: meta.height }}
                  />
                  <span className="ok-pdf-thumb-num">{pageNumber}</span>
                </button>
              );
            }}
          </ThumbnailsPane>
        )}

        <div className="ok-pdf-pages">
          <GlobalPointerProvider documentId={props.documentId}>
            <Viewport documentId={props.documentId} className="ok-pdf-viewport">
              <Scroller
                documentId={props.documentId}
                className="ok-pdf-scroller"
                renderPage={({ pageIndex }) => (
                  <PagePointerProvider
                    documentId={props.documentId}
                    pageIndex={pageIndex}
                    className="ok-pdf-page-container"
                    style={{ cursor: 'text' }}
                  >
                    <RenderLayer
                      documentId={props.documentId}
                      pageIndex={pageIndex}
                      className="ok-pdf-page"
                      role="img"
                      aria-label={t`Page ${pageIndex + 1}`}
                      draggable={false}
                      style={{ pointerEvents: 'none' }}
                    />
                    <SelectionLayer
                      documentId={props.documentId}
                      pageIndex={pageIndex}
                      textStyle={{ background: 'rgba(37, 99, 235, 0.32)' }}
                    />
                  </PagePointerProvider>
                )}
              />
            </Viewport>
          </GlobalPointerProvider>
        </div>
      </div>
    </>
  );
}

function PdfStatus(props: { title?: string; error?: string }) {
  return (
    <>
      <div className="ok-pdf-toolbar" contentEditable={false}>
        <span className="ok-pdf-title">{props.title ?? 'PDF'}</span>
      </div>
      <div className="ok-pdf-body">
        <div className={props.error ? 'ok-pdf-error' : 'ok-pdf-loading'} aria-live="polite">
          {props.error ? (
            <Trans>Failed to load PDF: {props.error}</Trans>
          ) : (
            <Trans>Loading PDF</Trans>
          )}
        </div>
      </div>
    </>
  );
}

interface LayoutMenuItemProps {
  label: string;
  active: boolean;
  onSelect: () => void;
}

function LayoutMenuItem(props: LayoutMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={props.active}
      className="ok-pdf-menu-item"
      data-active={props.active || undefined}
      onClick={props.onSelect}
    >
      <span className="ok-pdf-menu-check" aria-hidden="true">
        {props.active && <Check size={14} />}
      </span>
      {props.label}
    </button>
  );
}

function clampPage(page: number, totalPages: number): number {
  return Math.max(1, Math.min(Math.max(totalPages, 1), page));
}
