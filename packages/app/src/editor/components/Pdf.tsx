/**
 * Lightweight boundary for the bundled PDF viewer.
 *
 * The implementation lives in `PdfEmbed.tsx` so PDFium, its WASM runtime, and
 * the EmbedPDF plugins stay out of the main application chunk. The outer
 * component owns only the stable public props and height/anchor parsing used by
 * both inline document embeds and the route-level asset preview.
 */

import { parsePdfAnchor } from '@inkeep/open-knowledge-core';
import { Trans } from '@lingui/react/macro';
import { lazy, Suspense } from 'react';

export interface PdfProps {
  src?: string;
  title?: string;
  /** Single string from the wikiLinkEmbed anchor slot. Possibly empty. */
  anchor?: string;
  /** Fill a route-level preview host instead of using the inline default. */
  fillContainer?: boolean;
  /** Asset identity used when publishing a dragged passage to chat. */
  selectionDocumentName?: string;
}

const DEFAULT_HEIGHT_PX = 600;

const LazyPdfEmbed = lazy(async () => {
  const module = await import('./PdfEmbed.tsx');
  return { default: module.PdfEmbed };
});

export function Pdf(props: PdfProps) {
  const { height: anchorHeight, viewerFragment } = parsePdfAnchor(props.anchor);
  const heightStyle =
    anchorHeight !== null
      ? `${anchorHeight}px`
      : props.fillContainer
        ? '100%'
        : `${DEFAULT_HEIGHT_PX}px`;

  return (
    <div className="ok-pdf" style={{ height: heightStyle }}>
      {props.src ? (
        <Suspense
          fallback={
            <div className="ok-pdf-loading">
              <Trans>Loading PDF</Trans>
            </div>
          }
        >
          <LazyPdfEmbed
            key={props.src}
            src={props.src}
            title={props.title}
            targetPage={parseTargetPage(viewerFragment)}
            selectionDocumentName={props.selectionDocumentName}
          />
        </Suspense>
      ) : (
        <div className="ok-pdf-error">
          <Trans>Failed to load PDF: Missing PDF source</Trans>
        </div>
      )}
    </div>
  );
}

function parseTargetPage(viewerFragment: string): number | null {
  if (!viewerFragment) return null;
  for (const segment of viewerFragment.split('&')) {
    const separator = segment.indexOf('=');
    if (separator < 0 || segment.slice(0, separator) !== 'page') continue;
    const page = Number.parseInt(segment.slice(separator + 1), 10);
    if (!Number.isNaN(page) && page >= 1) return page;
  }
  return null;
}
