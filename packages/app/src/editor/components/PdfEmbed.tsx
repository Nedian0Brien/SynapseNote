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
  PdfActionType,
  type PdfAnnotationObject,
  PdfAnnotationSubtype,
  type PdfBookmarkObject,
  type PdfDocumentObject,
  type PdfHighlightAnnoObject,
  type PdfLinkAnnoObject,
  type PdfLinkTarget,
  type PdfTextAnnoObject,
} from '@embedpdf/models';
import {
  AnnotationLayer,
  AnnotationPluginPackage,
  useAnnotation,
} from '@embedpdf/plugin-annotation/react';
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react';
import { ExportPluginPackage, useExport } from '@embedpdf/plugin-export/react';
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
import { SearchLayer, SearchPluginPackage, useSearch } from '@embedpdf/plugin-search/react';
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
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type BacklinkEntry,
  BacklinksSuccessSchema,
  toDesktopAssetHref,
} from '@nedian0brien/synapsenote-core';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  File,
  Highlighter,
  LoaderCircle,
  MessageSquareText,
  PanelLeft,
  Save,
  Search,
  StickyNote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { type ReactNode, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PdfPanelTab } from '@/components/DocPanel';
import { composeTerminalSelectionPaste } from '@/components/handoff/compose-terminal-selection';
import { requestActiveTerminalInput } from '@/components/handoff/terminal-input-events';
import { type PanelOutlineItem, PanelOutlineList } from '@/components/PanelOutlineList';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelEmpty,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel';
import { Separator } from '@/components/ui/separator';
import { publishSelectionContext, selectionSnapshotFromPdf } from '@/editor/selection-context';
import { hashFromDocName } from '@/lib/doc-hash';
import {
  type PdfReadingPosition,
  readPdfReadingPosition,
  writePdfReadingPosition,
} from '@/lib/pdf-reading-position-store';
import { PDF_HIGHLIGHT_COLORS, PdfAnnotationMenu, PdfSelectionMenu } from './PdfSelectionMenu.tsx';
import { useSharedPdfiumEngine } from './pdfium-engine.ts';

export interface PdfEmbedProps {
  src: string;
  title?: string;
  targetPage: number | null;
  selectionDocumentName?: string;
  /** Route-level viewer uses the shared identity header and compact controls. */
  standaloneViewer?: boolean;
  panelContainer?: HTMLElement | null;
  activePanelTab?: PdfPanelTab;
}

type SharedPdfiumEngine = NonNullable<ReturnType<typeof useSharedPdfiumEngine>['engine']>;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

type PdfLayoutMode = 'fit-width' | 'fit-height' | 'single' | 'two-odd' | 'two-even';
type PdfSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

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
    createPluginRegistration(SearchPluginPackage, {
      showAllResults: true,
    }),
    createPluginRegistration(SelectionPluginPackage, {
      marquee: { enabled: false },
      minSelectionDragDistance: 2,
      toleranceFactor: 1.5,
      maxCachedGeometries: 12,
    }),
    createPluginRegistration(AnnotationPluginPackage, {
      annotationAuthor: 'SynapseNote',
      autoCommit: true,
      selectAfterCreate: true,
    }),
    createPluginRegistration(ExportPluginPackage, {
      defaultFileName: props.title ?? 'document.pdf',
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
    return (
      <PdfStatus
        title={props.title}
        error={error.message}
        standaloneViewer={props.standaloneViewer}
      />
    );
  }
  if (loading || !engine) {
    return <PdfStatus title={props.title} standaloneViewer={props.standaloneViewer} />;
  }

  return (
    <EmbedPDF key={documentUrl} engine={engine} plugins={plugins}>
      {({ pluginsReady, activeDocumentId }) => {
        if (!pluginsReady || !activeDocumentId) {
          return <PdfStatus title={props.title} standaloneViewer={props.standaloneViewer} />;
        }
        return (
          <DocumentContent documentId={activeDocumentId}>
            {({ documentState, isLoading, isError, isLoaded }) => {
              if (isError) {
                return (
                  <PdfStatus
                    title={props.title}
                    error={documentState.error ?? 'Unknown PDF error'}
                    standaloneViewer={props.standaloneViewer}
                  />
                );
              }
              if (isLoading || !isLoaded || !documentState.document) {
                return <PdfStatus title={props.title} standaloneViewer={props.standaloneViewer} />;
              }
              return (
                <LoadedPdf
                  documentId={activeDocumentId}
                  document={documentState.document}
                  engine={engine}
                  title={props.title}
                  totalPages={documentState.document.pages.length}
                  targetPage={props.targetPage}
                  selectionDocumentName={props.selectionDocumentName}
                  sourceAssetPath={pdfAssetPathFromSource(props.src)}
                  readingPositionKey={pdfAssetPathFromSource(props.src) ?? props.src}
                  standaloneViewer={props.standaloneViewer}
                  panelContainer={props.panelContainer}
                  activePanelTab={props.activePanelTab}
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
  document: PdfDocumentObject;
  engine: SharedPdfiumEngine;
  title?: string;
  totalPages: number;
  targetPage: number | null;
  selectionDocumentName?: string;
  sourceAssetPath: string | null;
  readingPositionKey: string;
  standaloneViewer?: boolean;
  panelContainer?: HTMLElement | null;
  activePanelTab?: PdfPanelTab;
}

function LoadedPdf(props: LoadedPdfProps) {
  const { t } = useLingui();
  const { state: scrollState, provides: scroll } = useScroll(props.documentId);
  const { state: zoomState, provides: zoom } = useZoom(props.documentId);
  const { spreadMode, provides: spread } = useSpread(props.documentId);
  const { provides: selection } = useSelectionCapability();
  const { state: annotationState, provides: annotation } = useAnnotation(props.documentId);
  const { provides: pdfExport } = useExport(props.documentId);
  const { state: searchState, provides: search } = useSearch(props.documentId);
  const [initialReadingPosition] = useState<PdfReadingPosition>(() => {
    if (props.targetPage !== null) {
      return { pageNumber: props.targetPage, pageOffsetY: 0 };
    }
    return readPdfReadingPosition(props.readingPositionKey) ?? { pageNumber: 1, pageOffsetY: 0 };
  });
  const initialPage = clampPage(initialReadingPosition.pageNumber, props.totalPages);
  const initialPageOffsetY =
    initialPage === initialReadingPosition.pageNumber ? initialReadingPosition.pageOffsetY : 0;
  const initialPageApplied = useRef(false);
  const pendingReadingPositionRef = useRef<PdfReadingPosition | null>(null);
  const readingPositionWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutZoomFrame = useRef<number | null>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastScrolledSearchResultRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const [pageInputDraft, setPageInputDraft] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<PdfLayoutMode>('fit-width');
  const [showThumbs, setShowThumbs] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [highlightColor, setHighlightColor] = useState<string>(PDF_HIGHLIGHT_COLORS[0]);
  const [pdfSaveState, setPdfSaveState] = useState<PdfSaveState>('clean');
  const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[] | null>(null);
  const currentPage = clampPage(scrollState.currentPage, props.totalPages);
  const pageInputValue = pageInputDraft ?? String(currentPage);
  const canOverwriteSource = Boolean(props.sourceAssetPath && window.okDesktop?.shell.savePdf);

  const openSearch = () => {
    lastScrolledSearchResultRef.current = null;
    setSearchOpen(true);
    search?.startSearch();
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };
  const openSearchEvent = useEffectEvent(openSearch);

  const closeSearch = () => {
    lastScrolledSearchResultRef.current = null;
    setSearchOpen(false);
    setSearchDraft('');
    search?.stopSearch();
    pagesRef.current?.focus({ preventScroll: true });
  };

  const enqueuePdfSave = (allowDownload: boolean) => {
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    setPdfSaveState('dirty');

    if (!pdfExport) {
      setPdfSaveState('error');
      return;
    }
    if (!canOverwriteSource && !allowDownload) return;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (mountedRef.current) setPdfSaveState('saving');
        try {
          const buffer = await pdfExport.saveAsCopy().toPromise();
          const assetPath = props.sourceAssetPath;
          const savePdf = window.okDesktop?.shell.savePdf;
          if (assetPath && savePdf) {
            const result = await savePdf(assetPath, new Uint8Array(buffer));
            if (!result.ok) {
              console.error('[pdf] failed to persist annotations', result.reason);
              if (mountedRef.current) setPdfSaveState('error');
              return;
            }
          } else {
            downloadPdfCopy(buffer, props.title ?? 'document.pdf');
          }
          if (mountedRef.current && saveRevisionRef.current === revision) {
            setPdfSaveState('saved');
          }
        } catch (error) {
          console.error('[pdf] failed to persist annotations', error);
          if (mountedRef.current) setPdfSaveState('error');
        }
      });
  };
  const enqueuePdfSaveEvent = useEffectEvent(enqueuePdfSave);

  useEffect(() => {
    if (initialPageApplied.current || !scroll) return;
    initialPageApplied.current = true;
    scroll.scrollToPage({
      pageNumber: initialPage,
      ...(initialPageOffsetY > 0 ? { pageCoordinates: { x: 0, y: initialPageOffsetY } } : {}),
      behavior: 'instant',
      alignY: 0,
    });
  }, [initialPage, initialPageOffsetY, scroll]);

  useEffect(() => {
    if (!scroll) return;
    const flushReadingPosition = () => {
      const position = pendingReadingPositionRef.current;
      pendingReadingPositionRef.current = null;
      if (position) writePdfReadingPosition(props.readingPositionKey, position);
    };
    const stop = scroll.onScroll((metrics) => {
      const leadingPage = metrics.pageVisibilityMetrics[0];
      pendingReadingPositionRef.current = {
        pageNumber: clampPage(leadingPage?.pageNumber ?? metrics.currentPage, props.totalPages),
        pageOffsetY: Math.max(0, leadingPage?.original.pageY ?? 0),
      };
      if (readingPositionWriteTimerRef.current !== null) {
        clearTimeout(readingPositionWriteTimerRef.current);
      }
      readingPositionWriteTimerRef.current = setTimeout(() => {
        readingPositionWriteTimerRef.current = null;
        flushReadingPosition();
      }, 150);
    });
    return () => {
      stop();
      if (readingPositionWriteTimerRef.current !== null) {
        clearTimeout(readingPositionWriteTimerRef.current);
        readingPositionWriteTimerRef.current = null;
      }
      flushReadingPosition();
    };
  }, [props.readingPositionKey, props.totalPages, scroll]);

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
    if (!searchOpen || !search) return;
    const timer = window.setTimeout(
      () => search.searchAllPages(searchDraft),
      searchDraft.trim() === '' ? 0 : 150,
    );
    return () => window.clearTimeout(timer);
  }, [search, searchDraft, searchOpen]);

  useEffect(() => {
    const activeResult = searchState.results[searchState.activeResultIndex];
    if (!searchOpen || !scroll || !activeResult) return;
    const resultKey = `${searchState.query}:${searchState.activeResultIndex}:${activeResult.pageIndex}:${activeResult.charIndex}`;
    if (lastScrolledSearchResultRef.current === resultKey) return;
    lastScrolledSearchResultRef.current = resultKey;
    const firstRect = activeResult.rects[0];
    scroll.scrollToPage({
      pageNumber: activeResult.pageIndex + 1,
      ...(firstRect
        ? {
            pageCoordinates: {
              x: firstRect.origin.x + firstRect.size.width / 2,
              y: firstRect.origin.y + firstRect.size.height / 2,
            },
          }
        : {}),
      behavior: 'smooth',
      alignX: 50,
      alignY: 40,
    });
  }, [scroll, searchOpen, searchState.activeResultIndex, searchState.query, searchState.results]);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'f') {
        return;
      }
      const viewer = pagesRef.current?.closest('.ok-pdf');
      const viewerHasFocus = viewer?.contains(document.activeElement);
      if (!props.standaloneViewer && !viewerHasFocus) return;
      event.preventDefault();
      event.stopPropagation();
      openSearchEvent();
    };
    window.addEventListener('keydown', handleFindShortcut, true);
    return () => window.removeEventListener('keydown', handleFindShortcut, true);
  }, [props.standaloneViewer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBookmarks(null);
    props.engine.getBookmarks(props.document).wait(
      (result) => {
        if (!cancelled) setBookmarks(result.bookmarks);
      },
      () => {
        if (!cancelled) setBookmarks([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [props.document, props.engine]);

  useEffect(() => {
    if (!annotation) return;
    return annotation.onAnnotationEvent((event) => {
      if (event.type === 'loaded' || !event.committed) return;
      enqueuePdfSaveEvent(false);
    });
  }, [annotation]);

  useEffect(() => {
    const documentName = props.selectionDocumentName;
    if (!selection) return;
    const scope = selection.forDocument(props.documentId);
    let publishGeneration = 0;

    const publishSelectedText = () => {
      publishGeneration = publishGeneration + 1;
      const generation = publishGeneration;
      scope.getSelectedText().wait(
        (lines) => {
          if (generation !== publishGeneration) return;
          const text = lines.join('\n');
          setSelectedText(text);
          if (documentName) {
            publishSelectionContext(
              documentName,
              'pdf',
              selectionSnapshotFromPdf(text, documentName),
            );
          }
        },
        () => {
          if (generation === publishGeneration) {
            setSelectedText('');
            if (documentName) publishSelectionContext(documentName, 'pdf', null);
          }
        },
      );
    };

    const stopEnd = scope.onEndSelection(publishSelectedText);
    const stopChange = scope.onSelectionChange((nextSelection) => {
      if (nextSelection === null) {
        publishGeneration += 1;
        setSelectedText('');
        if (documentName) publishSelectionContext(documentName, 'pdf', null);
      }
    });
    return () => {
      publishGeneration += 1;
      stopEnd();
      stopChange();
      if (documentName) publishSelectionContext(documentName, 'pdf', null);
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
    writePdfReadingPosition(props.readingPositionKey, {
      pageNumber: clamped,
      pageOffsetY: 0,
    });
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

  const createHighlight = (color: string) => {
    if (!selection || !annotation) return;
    const scope = selection.forDocument(props.documentId);
    for (const selectedRange of scope.getFormattedSelection()) {
      const highlight: PdfHighlightAnnoObject = {
        type: PdfAnnotationSubtype.HIGHLIGHT,
        id: createPdfAnnotationId(),
        pageIndex: selectedRange.pageIndex,
        rect: selectedRange.rect,
        segmentRects: selectedRange.segmentRects,
        strokeColor: color,
        opacity: 0.45,
        flags: ['print'],
        created: new Date(),
        subject: selectedText || undefined,
      };
      annotation.createAnnotation(selectedRange.pageIndex, highlight);
    }
    scope.clear();
  };

  const createMemo = (pageIndex: number, contents: string) => {
    if (!selection || !annotation) return;
    const scope = selection.forDocument(props.documentId);
    const selectedRange = scope.getFormattedSelectionForPage(pageIndex);
    const memoText = contents.trim();
    if (!selectedRange || memoText === '') return;
    const memoId = createPdfAnnotationId();
    const memo: PdfTextAnnoObject = {
      type: PdfAnnotationSubtype.TEXT,
      id: memoId,
      pageIndex,
      rect: memoRectForSelection(selectedRange.rect),
      contents: memoText,
      strokeColor: '#facc15',
      opacity: 1,
      flags: ['print', 'noZoom'],
      created: new Date(),
      custom: selectedText ? { synapseNoteSelection: selectedText } : undefined,
    };
    annotation.createAnnotation(pageIndex, memo);
    annotation.selectAnnotation(pageIndex, memoId);
    scope.clear();
  };

  const askAiAboutSelection = () => {
    const selectionText = selectedText.trim();
    const documentName = props.selectionDocumentName;
    if (selectionText === '' || !documentName) return;
    selection?.forDocument(props.documentId).clear();
    requestAnimationFrame(() => {
      requestActiveTerminalInput(composeTerminalSelectionPaste(documentName, selectionText));
    });
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
  const pdfSaveLabel =
    pdfSaveState === 'saving'
      ? t`Saving PDF`
      : pdfSaveState === 'error'
        ? t`PDF save failed. Retry`
        : pdfSaveState === 'saved'
          ? canOverwriteSource
            ? t`PDF saved`
            : t`PDF copy downloaded`
          : canOverwriteSource
            ? t`Save PDF`
            : t`Download PDF copy`;

  const trackedAnnotations = Object.entries(annotationState.pages ?? {})
    .flatMap(([pageIndex, ids]) =>
      ids.flatMap((id) => {
        const tracked = annotationState.byUid?.[id];
        return tracked ? [{ id, pageIndex: Number(pageIndex), object: tracked.object }] : [];
      }),
    )
    .sort((a, b) => a.pageIndex - b.pageIndex);
  const panelAnnotations = trackedAnnotations.filter(
    ({ object }) =>
      object.type === PdfAnnotationSubtype.HIGHLIGHT || object.type === PdfAnnotationSubtype.TEXT,
  );
  const panelLinks = trackedAnnotations.filter(
    (entry): entry is PdfPanelEntry<PdfLinkAnnoObject> =>
      entry.object.type === PdfAnnotationSubtype.LINK,
  );

  const navigateToTarget = (target: PdfLinkTarget) => {
    annotation?.navigateTarget(target).wait(
      () => {},
      (error) => console.error('[pdf] failed to navigate link target', error),
    );
  };

  const selectPanelAnnotation = (entry: PdfPanelEntry) => {
    setPageInputDraft(null);
    const rect = entry.object.rect;
    scroll?.scrollToPage({
      pageNumber: entry.pageIndex + 1,
      pageCoordinates: {
        x: rect.origin.x + rect.size.width / 2,
        y: rect.origin.y + rect.size.height / 2,
      },
      behavior: 'smooth',
      alignX: 50,
      alignY: 40,
    });
    annotation?.selectAnnotation(entry.pageIndex, entry.id);
  };

  const panelPortal =
    props.panelContainer && props.activePanelTab
      ? createPortal(
          <PdfRailContent
            activeTab={props.activePanelTab}
            documentId={props.documentId}
            document={props.document}
            documentName={props.selectionDocumentName ?? null}
            totalPages={props.totalPages}
            currentPage={currentPage}
            annotations={panelAnnotations}
            selectedAnnotationId={annotationState.selectedUid}
            links={panelLinks}
            bookmarks={bookmarks}
            onGoToPage={goToPage}
            onSelectAnnotation={selectPanelAnnotation}
            onNavigateTarget={navigateToTarget}
          />,
          props.panelContainer,
        )
      : null;

  return (
    <>
      {panelPortal}
      <div
        className={
          props.standaloneViewer ? 'ok-pdf-toolbar ok-pdf-toolbar--standalone' : 'ok-pdf-toolbar'
        }
        contentEditable={false}
      >
        {props.standaloneViewer ? null : (
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
        )}
        {props.standaloneViewer ? null : (
          <span className="ok-pdf-title">{props.title ?? 'PDF'}</span>
        )}
        <div className="ok-pdf-controls">
          {searchOpen ? (
            <form
              className="ok-pdf-search"
              onSubmit={(event) => {
                event.preventDefault();
                const query = searchDraft.trim();
                if (query === '') return;
                if (searchState.query !== query) {
                  search?.searchAllPages(query);
                } else {
                  search?.nextResult();
                }
              }}
            >
              <Search size={14} aria-hidden="true" className="ok-pdf-search-icon" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeSearch();
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const query = searchDraft.trim();
                    if (query === '') return;
                    if (searchState.query !== query) {
                      search?.searchAllPages(query);
                    } else if (event.shiftKey) {
                      search?.previousResult();
                    } else {
                      search?.nextResult();
                    }
                  }
                }}
                className="ok-pdf-search-input"
                aria-label={t`Search PDF`}
                placeholder={t`Find in PDF`}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="ok-pdf-search-count" aria-live="polite">
                {searchState.loading ? (
                  <LoaderCircle size={13} className="animate-spin" aria-label={t`Searching`} />
                ) : searchDraft.trim() === '' ? null : searchState.total === 0 ? (
                  <Trans>No results</Trans>
                ) : (
                  `${searchState.activeResultIndex + 1} / ${searchState.total}`
                )}
              </span>
              <button
                type="button"
                className="ok-pdf-btn"
                onClick={() => search?.previousResult()}
                disabled={searchState.total === 0}
                aria-label={t`Previous result`}
                title={t`Previous result`}
              >
                <ChevronUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ok-pdf-btn"
                onClick={() => search?.nextResult()}
                disabled={searchState.total === 0}
                aria-label={t`Next result`}
                title={t`Next result`}
              >
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ok-pdf-btn"
                onClick={closeSearch}
                aria-label={t`Close search`}
                title={t`Close search`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={openSearch}
              aria-label={t`Search PDF`}
              aria-keyshortcuts="Meta+F Control+F"
              className="ok-pdf-btn"
              title={t`Find in PDF`}
            >
              <Search size={14} aria-hidden="true" />
            </button>
          )}

          <span className="ok-pdf-divider" aria-hidden="true" />

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

          <button
            type="button"
            onClick={() => enqueuePdfSave(true)}
            disabled={!pdfExport || pdfSaveState === 'saving'}
            aria-label={pdfSaveLabel}
            className="ok-pdf-btn"
            title={pdfSaveLabel}
            data-save-state={pdfSaveState}
          >
            {pdfSaveState === 'saving' ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            ) : pdfSaveState === 'error' ? (
              <AlertTriangle size={14} aria-hidden="true" />
            ) : pdfSaveState === 'saved' ? (
              <Check size={14} aria-hidden="true" />
            ) : canOverwriteSource ? (
              <Save size={14} aria-hidden="true" />
            ) : (
              <Download size={14} aria-hidden="true" />
            )}
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

      <div
        className={props.standaloneViewer ? 'ok-pdf-body ok-pdf-body--standalone' : 'ok-pdf-body'}
      >
        {showThumbs && !props.standaloneViewer && (
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

        <div
          ref={pagesRef}
          className="ok-pdf-pages"
          tabIndex={-1}
          onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
          onCopy={(event) => {
            const text = selectedText;
            if (!text) return;
            event.preventDefault();
            event.stopPropagation();
            event.clipboardData.setData('text/plain', text);
          }}
        >
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
                    <SearchLayer
                      documentId={props.documentId}
                      pageIndex={pageIndex}
                      className="ok-pdf-search-layer"
                      highlightColor="rgba(250, 204, 21, 0.55)"
                      activeHighlightColor="rgba(249, 115, 22, 0.75)"
                    />
                    <SelectionLayer
                      documentId={props.documentId}
                      pageIndex={pageIndex}
                      textStyle={{ background: 'rgba(37, 99, 235, 0.32)' }}
                      selectionMenu={(menuProps) => (
                        <PdfSelectionMenu
                          {...menuProps}
                          canAskAi={Boolean(props.selectionDocumentName && selectedText.trim())}
                          highlightColor={highlightColor}
                          onHighlightColorChange={setHighlightColor}
                          onHighlight={createHighlight}
                          onMemo={(contents) => createMemo(pageIndex, contents)}
                          onAskAi={askAiAboutSelection}
                        />
                      )}
                    />
                    <AnnotationLayer
                      documentId={props.documentId}
                      pageIndex={pageIndex}
                      selectionMenu={(menuProps) => (
                        <PdfAnnotationMenu
                          {...menuProps}
                          onUpdateMemo={(contents) => {
                            annotation?.updateAnnotation(
                              menuProps.context.pageIndex,
                              menuProps.context.annotation.object.id,
                              { contents, modified: new Date() },
                            );
                          }}
                          onUpdateColor={(strokeColor) => {
                            annotation?.updateAnnotation(
                              menuProps.context.pageIndex,
                              menuProps.context.annotation.object.id,
                              { strokeColor, modified: new Date() },
                            );
                          }}
                          onDelete={() => {
                            annotation?.deleteAnnotation(
                              menuProps.context.pageIndex,
                              menuProps.context.annotation.object.id,
                            );
                          }}
                          onClose={() => annotation?.deselectAnnotation()}
                        />
                      )}
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

interface PdfPanelEntry<T extends PdfAnnotationObject = PdfAnnotationObject> {
  id: string;
  pageIndex: number;
  object: T;
}

interface PdfRailContentProps {
  activeTab: PdfPanelTab;
  documentId: string;
  document: PdfDocumentObject;
  documentName: string | null;
  totalPages: number;
  currentPage: number;
  annotations: PdfPanelEntry[];
  selectedAnnotationId: string | null;
  links: PdfPanelEntry<PdfLinkAnnoObject>[];
  bookmarks: PdfBookmarkObject[] | null;
  onGoToPage: (page: number) => void;
  onSelectAnnotation: (entry: PdfPanelEntry) => void;
  onNavigateTarget: (target: PdfLinkTarget) => void;
}

function PdfRailContent(props: PdfRailContentProps) {
  if (props.activeTab === 'pages') {
    return (
      <PdfPagesPanel
        documentId={props.documentId}
        document={props.document}
        currentPage={props.currentPage}
        onGoToPage={props.onGoToPage}
      />
    );
  }

  if (props.activeTab === 'annotations') {
    return (
      <PdfAnnotationsPanel
        annotations={props.annotations}
        selectedAnnotationId={props.selectedAnnotationId}
        onSelectAnnotation={props.onSelectAnnotation}
      />
    );
  }

  if (props.activeTab === 'outline') {
    return (
      <PdfOutlinePanel
        bookmarks={props.bookmarks}
        currentPage={props.currentPage}
        onNavigateTarget={props.onNavigateTarget}
      />
    );
  }

  return (
    <PdfLinksPanel
      documentName={props.documentName}
      links={props.links}
      annotations={props.annotations}
      onSelectAnnotation={props.onSelectAnnotation}
      onNavigateTarget={props.onNavigateTarget}
    />
  );
}

const PDF_PANEL_THUMB_WIDTH = 112;
const PDF_PANEL_THUMB_LABEL_HEIGHT = 18;

function PdfPagesPanel({
  documentId,
  document,
  currentPage,
  onGoToPage,
}: {
  documentId: string;
  document: PdfDocumentObject;
  currentPage: number;
  onGoToPage: (page: number) => void;
}) {
  const { t } = useLingui();
  const pageButtonsRef = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    pageButtonsRef.current.get(currentPage)?.scrollIntoView?.({ block: 'nearest' });
  }, [currentPage]);

  return (
    <section className="ok-pdf-pages-panel" aria-label={t`Pages`}>
      <div className="ok-pdf-pages-grid">
        {document.pages.map((page, pageIndex) => {
          const pageNumber = pageIndex + 1;
          const sourceWidth = page?.size?.width || PDF_PANEL_THUMB_WIDTH;
          const sourceHeight = page?.size?.height || 148;
          const height = Math.round((PDF_PANEL_THUMB_WIDTH / sourceWidth) * sourceHeight);
          const meta: ThumbMeta = {
            pageIndex,
            width: PDF_PANEL_THUMB_WIDTH,
            height,
            wrapperHeight: height + PDF_PANEL_THUMB_LABEL_HEIGHT,
            top: 0,
            labelHeight: PDF_PANEL_THUMB_LABEL_HEIGHT,
            padding: 0,
          };
          return (
            <button
              type="button"
              // biome-ignore lint/suspicious/noArrayIndexKey: PDF page order and indices are immutable for the lifetime of the loaded document.
              key={pageIndex}
              ref={(element) => {
                if (element) pageButtonsRef.current.set(pageNumber, element);
                else pageButtonsRef.current.delete(pageNumber);
              }}
              className="ok-pdf-panel-thumb"
              data-active={currentPage === pageNumber || undefined}
              onClick={() => onGoToPage(pageNumber)}
              aria-label={t`Jump to page ${pageNumber}`}
            >
              <LazyPdfPanelThumbnail documentId={documentId} meta={meta} />
              <span className="ok-pdf-thumb-num">{pageNumber}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LazyPdfPanelThumbnail({ documentId, meta }: { documentId: string; meta: ThumbMeta }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={hostRef}
      className="ok-pdf-thumb-image block"
      style={{ width: meta.width, height: meta.height }}
    >
      {visible ? (
        <ThumbImg
          documentId={documentId}
          meta={meta}
          aria-hidden="true"
          draggable={false}
          className="block size-full object-contain"
        />
      ) : null}
    </span>
  );
}

function PdfAnnotationsPanel({
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
}: {
  annotations: PdfPanelEntry[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (entry: PdfPanelEntry) => void;
}) {
  const { t } = useLingui();
  if (annotations.length === 0) {
    return (
      <PdfRailEmptyState
        icon={Highlighter}
        title={t`No annotations`}
        description={t`Select PDF text to add a highlight or memo.`}
      />
    );
  }

  return (
    <Panel aria-label={t`Annotations`}>
      <PanelHeader className="border-b px-4 py-3">
        <PanelTitle>
          <Trans>Annotations</Trans>
        </PanelTitle>
        <PanelCount>{annotations.length}</PanelCount>
      </PanelHeader>
      <PanelBody className="px-0 py-0">
        <div className="flex flex-col">
          {annotations.map((entry) => {
            const isMemo = entry.object.type === PdfAnnotationSubtype.TEXT;
            const source = isMemo ? '' : pdfHighlightSource(entry.object);
            const memo = isMemo
              ? pdfAnnotationContents(entry.object)
              : pdfHighlightMemo(entry.object);
            const label = isMemo ? t`Memo` : t`Highlight`;
            const Icon = isMemo ? MessageSquareText : Highlighter;
            const selected = entry.id === selectedAnnotationId;
            return (
              <button
                type="button"
                key={entry.id}
                className="relative flex w-full items-start gap-2.5 border-b border-l-2 border-b-border/60 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[selected=true]:bg-muted/80"
                style={{ borderLeftColor: pdfAnnotationColor(entry.object) }}
                data-selected={selected}
                onClick={() => onSelectAnnotation(entry)}
                aria-label={t`${label} on page ${entry.pageIndex + 1}`}
              >
                <Icon
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: pdfAnnotationColor(entry.object) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-muted-foreground">
                    {label} · {t`Page ${entry.pageIndex + 1}`}
                  </span>
                  {source && (
                    <span className="mt-1 block line-clamp-3 text-xs leading-5 text-foreground">
                      “{source}”
                    </span>
                  )}
                  {memo && (
                    <span
                      className={
                        source
                          ? 'mt-2 flex items-start gap-1.5 border-t border-border/50 pt-2 text-xs leading-5 text-muted-foreground'
                          : 'mt-1 block line-clamp-3 text-xs leading-5 text-foreground'
                      }
                    >
                      {source && (
                        <MessageSquareText
                          className="mt-0.5 size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span className="line-clamp-3">{memo}</span>
                    </span>
                  )}
                  {!source && !memo && (
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      <Trans>No annotation text</Trans>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </PanelBody>
    </Panel>
  );
}

function PdfOutlinePanel({
  bookmarks,
  currentPage,
  onNavigateTarget,
}: {
  bookmarks: PdfBookmarkObject[] | null;
  currentPage: number;
  onNavigateTarget: (target: PdfLinkTarget) => void;
}) {
  const { t } = useLingui();
  const flattened = flattenPdfBookmarks(bookmarks ?? []);
  const items: PanelOutlineItem[] = flattened.map(({ bookmark, depth }, index) => ({
    key: `${bookmark.title}-${pdfBookmarkTargetKey(bookmark.target)}-${index}`,
    title: bookmark.title,
    depth,
    disabled: !bookmark.target,
    onSelect: () => bookmark.target && onNavigateTarget(bookmark.target),
  }));
  let activeIndex = -1;
  for (let index = 0; index < flattened.length; index += 1) {
    const target = flattened[index]?.bookmark.target;
    if (!target) continue;
    const info = pdfLinkTargetInfo(target);
    if (info.kind === 'page' && info.page <= currentPage) activeIndex = index;
  }

  return (
    <PanelOutlineList
      title={<Trans>Outline</Trans>}
      items={items}
      activeIndex={activeIndex}
      ariaLabel={t`PDF outline`}
      loading={bookmarks === null}
      emptyText={<Trans>This PDF does not contain document bookmarks.</Trans>}
    />
  );
}

function flattenPdfBookmarks(
  bookmarks: PdfBookmarkObject[],
  depth = 0,
): { bookmark: PdfBookmarkObject; depth: number }[] {
  return bookmarks.flatMap((bookmark) => [
    { bookmark, depth },
    ...flattenPdfBookmarks(bookmark.children ?? [], depth + 1),
  ]);
}

function PdfLinksPanel({
  documentName,
  links,
  annotations,
  onSelectAnnotation,
  onNavigateTarget,
}: {
  documentName: string | null;
  links: PdfPanelEntry<PdfLinkAnnoObject>[];
  annotations: PdfPanelEntry[];
  onSelectAnnotation: (entry: PdfPanelEntry) => void;
  onNavigateTarget: (target: PdfLinkTarget) => void;
}) {
  const { t } = useLingui();
  const externalLinks = Array.from(
    new Map(
      links.flatMap((entry) => {
        const target = entry.object.target;
        return target && isExternalPdfTarget(target)
          ? [[`${entry.pageIndex}:${pdfBookmarkTargetKey(target)}`, entry] as const]
          : [];
      }),
    ).values(),
  );
  const memos = annotations.filter(({ object }) => object.type === PdfAnnotationSubtype.TEXT);
  const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([]);
  const [backlinksLoading, setBacklinksLoading] = useState(documentName !== null);
  const [backlinksError, setBacklinksError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBacklinks([]);
    setBacklinksError(false);
    if (documentName === null) {
      setBacklinksLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setBacklinksLoading(true);
    void fetchPdfBacklinks(documentName)
      .then((entries) => {
        if (!cancelled) setBacklinks(entries);
      })
      .catch(() => {
        if (!cancelled) setBacklinksError(true);
      })
      .finally(() => {
        if (!cancelled) setBacklinksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentName]);

  return (
    <Panel aria-label={t`PDF links`}>
      <PanelBody className="px-0 py-0">
        <PdfLinksSection title={t`External links`} count={externalLinks.length}>
          {externalLinks.length === 0 ? (
            <PdfLinksEmpty>{t`This PDF does not contain external links.`}</PdfLinksEmpty>
          ) : (
            externalLinks.map((entry) => {
              const target = entry.object.target as PdfLinkTarget;
              const targetInfo = pdfLinkTargetInfo(target);
              const targetLabel =
                targetInfo.kind === 'page'
                  ? t`Page ${targetInfo.page}`
                  : targetInfo.kind === 'unsupported'
                    ? t`Unsupported link`
                    : targetInfo.label;
              return (
                <button
                  type="button"
                  key={entry.id}
                  className="flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onNavigateTarget(target)}
                  title={targetLabel}
                >
                  <ArrowUpRight
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {targetLabel}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t`Page ${entry.pageIndex + 1}`}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </PdfLinksSection>
        <Separator />
        <PdfLinksSection title={t`Backlinks`} count={backlinks.length} loading={backlinksLoading}>
          {backlinksError ? (
            <PdfLinksEmpty>{t`Failed to load backlinks`}</PdfLinksEmpty>
          ) : backlinks.length === 0 && !backlinksLoading ? (
            <PdfLinksEmpty>{t`No pages link to this PDF yet.`}</PdfLinksEmpty>
          ) : (
            backlinks.map((backlink, index) => (
              <a
                // biome-ignore lint/suspicious/noArrayIndexKey: a source may contain multiple backlinks with the same anchor and the API preserves their positional order.
                key={`${backlink.source}-${backlink.anchor ?? ''}-${index}`}
                href={hashFromDocName(backlink.source, backlink.anchor)}
                className="flex items-start gap-2.5 rounded-md px-3 py-2.5 text-left no-underline transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <File
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {backlink.title}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                    {backlink.source}
                  </span>
                  {backlink.snippet ? (
                    <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {backlink.snippet}
                    </span>
                  ) : null}
                </span>
              </a>
            ))
          )}
        </PdfLinksSection>
        <Separator />
        <PdfLinksSection title={t`Memos`} count={memos.length}>
          {memos.length === 0 ? (
            <PdfLinksEmpty>{t`No memos have been created from this PDF yet.`}</PdfLinksEmpty>
          ) : (
            memos.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className="flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelectAnnotation(entry)}
              >
                <StickyNote
                  className="mt-0.5 size-3.5 shrink-0 text-amber-500"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-3 text-sm leading-5 text-foreground">
                    {pdfAnnotationContents(entry.object) || t`No memo text`}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t`Page ${entry.pageIndex + 1}`}
                  </span>
                </span>
              </button>
            ))
          )}
        </PdfLinksSection>
      </PanelBody>
    </Panel>
  );
}

function PdfLinksSection({
  title,
  count,
  loading = false,
  children,
}: {
  title: string;
  count: number;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between px-5 py-3 text-left transition-colors hover:bg-muted/40">
        <span className="flex items-center gap-2.5">
          <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          <PanelTitle>{title}</PanelTitle>
        </span>
        {!loading && <PanelCount>{count}</PanelCount>}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-2 pb-3" aria-busy={loading}>
          <div className="flex flex-col gap-1">{children}</div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PdfLinksEmpty({ children }: { children: ReactNode }) {
  return <PanelEmpty className="px-3 py-2">{children}</PanelEmpty>;
}

async function fetchPdfBacklinks(documentName: string): Promise<BacklinkEntry[]> {
  const response = await fetch(`/api/backlinks?docName=${encodeURIComponent(documentName)}`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(`Failed to load PDF backlinks (${response.status})`);
  const parsed = BacklinksSuccessSchema.safeParse(body);
  if (!parsed.success) throw new Error('Backlinks response did not match expected shape.');
  return parsed.data.backlinks;
}

function PdfRailEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Highlighter;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Icon className="mb-2 size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function pdfAnnotationContents(annotation: PdfAnnotationObject): string {
  const contents =
    'contents' in annotation && typeof annotation.contents === 'string'
      ? annotation.contents.trim()
      : '';
  if (contents) return contents;
  if ('subject' in annotation && typeof annotation.subject === 'string') {
    const subject = annotation.subject.trim();
    if (subject) return subject;
  }
  if (
    annotation.custom &&
    typeof annotation.custom === 'object' &&
    typeof annotation.custom.synapseNoteSelection === 'string'
  ) {
    return annotation.custom.synapseNoteSelection.trim();
  }
  return '';
}

function pdfHighlightSource(annotation: PdfAnnotationObject): string {
  if ('subject' in annotation && typeof annotation.subject === 'string') {
    const subject = annotation.subject.trim();
    if (subject) return subject;
  }
  if (
    annotation.custom &&
    typeof annotation.custom === 'object' &&
    typeof annotation.custom.synapseNoteSelection === 'string'
  ) {
    const selection = annotation.custom.synapseNoteSelection.trim();
    if (selection) return selection;
  }
  return pdfAnnotationContents(annotation);
}

function pdfHighlightMemo(annotation: PdfAnnotationObject): string {
  const sourceIsStoredSeparately =
    ('subject' in annotation &&
      typeof annotation.subject === 'string' &&
      annotation.subject.trim() !== '') ||
    (annotation.custom &&
      typeof annotation.custom === 'object' &&
      typeof annotation.custom.synapseNoteSelection === 'string' &&
      annotation.custom.synapseNoteSelection.trim() !== '');
  if (!sourceIsStoredSeparately) return '';
  return 'contents' in annotation && typeof annotation.contents === 'string'
    ? annotation.contents.trim()
    : '';
}

function pdfAnnotationColor(annotation: PdfAnnotationObject): string {
  return 'strokeColor' in annotation && typeof annotation.strokeColor === 'string'
    ? annotation.strokeColor
    : 'var(--muted-foreground)';
}

function isExternalPdfTarget(target: PdfLinkTarget): boolean {
  return target.type === 'action' && target.action.type === PdfActionType.URI;
}

function pdfBookmarkTargetKey(target: PdfLinkTarget | undefined): string {
  if (!target) return 'group';
  const info = pdfLinkTargetInfo(target);
  if (info.kind === 'page') return `page-${info.page}`;
  if (info.kind === 'label') return info.label;
  return 'unsupported';
}

function pdfLinkTargetInfo(
  target: PdfLinkTarget,
): { kind: 'page'; page: number } | { kind: 'label'; label: string } | { kind: 'unsupported' } {
  if (target.type === 'destination') {
    return { kind: 'page', page: target.destination.pageIndex + 1 };
  }
  if (target.action.type === PdfActionType.URI) {
    return { kind: 'label', label: target.action.uri };
  }
  if (
    target.action.type === PdfActionType.Goto ||
    target.action.type === PdfActionType.RemoteGoto
  ) {
    return { kind: 'page', page: target.action.destination.pageIndex + 1 };
  }
  if (target.action.type === PdfActionType.LaunchAppOrOpenFile) {
    return { kind: 'label', label: target.action.path };
  }
  return { kind: 'unsupported' };
}

function PdfStatus(props: { title?: string; error?: string; standaloneViewer?: boolean }) {
  return (
    <>
      <div
        className={
          props.standaloneViewer ? 'ok-pdf-toolbar ok-pdf-toolbar--standalone' : 'ok-pdf-toolbar'
        }
        contentEditable={false}
        aria-hidden={props.standaloneViewer || undefined}
      >
        {props.standaloneViewer ? null : (
          <span className="ok-pdf-title">{props.title ?? 'PDF'}</span>
        )}
      </div>
      <div
        className={props.standaloneViewer ? 'ok-pdf-body ok-pdf-body--standalone' : 'ok-pdf-body'}
      >
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

function createPdfAnnotationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `synapsenote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function memoRectForSelection(rect: {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}) {
  const size = 20;
  return {
    origin: {
      x: rect.origin.x + rect.size.width,
      y: rect.origin.y + Math.max(0, (rect.size.height - size) / 2),
    },
    size: { width: size, height: size },
  };
}

export function pdfAssetPathFromSource(src: string): string | null {
  try {
    const url = new URL(src, 'http://synapsenote.local');
    if (url.pathname !== '/api/asset') return null;
    const assetPath = url.searchParams.get('path');
    if (!assetPath || assetPath.includes('\0')) return null;
    return assetPath;
  } catch {
    return null;
  }
}

function downloadPdfCopy(buffer: ArrayBuffer, requestedName: string): void {
  const fileName = requestedName.toLowerCase().endsWith('.pdf')
    ? requestedName
    : `${requestedName}.pdf`;
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
