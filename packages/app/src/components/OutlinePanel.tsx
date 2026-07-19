// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/Nedian0Brien/SynapseNote/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { t } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type HeadingEntry,
  isManagedArtifactDocName,
  PageHeadingsSuccessSchema,
  ProblemDetailsSchema,
} from '@nedian0brien/synapsenote-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { usePageList } from '@/components/PageListContext';
import { PanelOutlineList } from '@/components/PanelOutlineList';
import { useDocumentContext } from '@/editor/DocumentContext';
import { HttpResponseParseError } from '@/editor/http-client';
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import { useActiveHeading } from '@/hooks/useActiveHeading';
import { ProfilerBoundary } from '@/lib/perf';

/**
 * Debounce window for Y.Doc update → page-headings invalidation. Matches the
 * `TYPING_DEFER_MS` convention from precedent #11 — a 300 ms trailing-edge
 * window coalesces bursts of keystrokes into a single fetch while still
 * updating the outline fast enough to feel live.
 */
const OUTLINE_INVALIDATE_DEBOUNCE_MS = 300;

async function fetchHeadings(docName: string): Promise<HeadingEntry[]> {
  const res = await fetch(`/api/page-headings?docName=${encodeURIComponent(docName)}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new HttpResponseParseError(t`Page headings response was not JSON`, {
      cause,
      status: res.status,
    });
  }
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    if (!problem.success) {
      throw new HttpResponseParseError(t`Page headings error response did not match RFC 9457`, {
        status: res.status,
      });
    }
    throw new Error(problem.data.title);
  }
  const success = PageHeadingsSuccessSchema.safeParse(body);
  if (!success.success) {
    throw new HttpResponseParseError(t`Page headings response did not match success schema`, {
      status: res.status,
    });
  }
  return success.data.headings ?? [];
}

export interface OutlineNavDetail {
  index: number;
  slug: string;
  mode: 'wysiwyg' | 'source';
}

export const OUTLINE_NAV_EVENT = 'synapsenote:outline-nav';

export function OutlinePanel(props: {
  docName: string;
  isSourceMode: boolean;
  className?: string;
}) {
  return (
    <ProfilerBoundary name="outline-panel">
      <OutlinePanelInner {...props} />
    </ProfilerBoundary>
  );
}

function OutlinePanelInner({
  docName,
  isSourceMode,
  className = '',
}: {
  docName: string;
  isSourceMode: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const { pages, loading } = usePageList();
  const queryClient = useQueryClient();
  const { activeProvider, activeDocName } = useDocumentContext();
  const {
    data: headings = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['page-headings', docName],
    queryFn: () => fetchHeadings(docName),
    enabled: !loading && (pages.has(docName) || isManagedArtifactDocName(docName)),
    // The Y.Doc `update` subscription below is authoritative for freshness —
    // background refetch on window-focus/reconnect would add wasted fetches
    // for data already guaranteed-current. Per TkDodo (TanStack Query
    // maintainer) guidance for subscription-source-authoritative queries:
    // https://tkdodo.eu/blog/using-web-sockets-with-react-query
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Precise-trigger invalidation. The active doc's Y.Doc `update` event fires
  // on every mutation — local typing, remote peer edits arriving via
  // WebSocket, and agent writes — so the outline stays fresh without
  // polling. We gate on `activeDocName === docName` because
  // `OutlinePanel` may briefly render for a doc that isn't the active one
  // during a navigation transition; in that case the initial query fetch is
  // sufficient and there's no point subscribing to a provider for a different
  // doc. `DocPanel` in practice only mounts one `OutlinePanel` at a time, but
  // the guard keeps this robust under future layout changes.
  useEffect(() => {
    if (!activeProvider || activeDocName !== docName) return;
    const doc = activeProvider.document;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void queryClient.invalidateQueries({ queryKey: ['page-headings', docName] });
      }, OUTLINE_INVALIDATE_DEBOUNCE_MS);
    };
    doc.on('update', onUpdate);
    return () => {
      doc.off('update', onUpdate);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
    };
  }, [activeProvider, activeDocName, docName, queryClient]);

  const slugs = headings.map((h) => h.slug);
  const activeSlug = useActiveHeading(slugs, isSourceMode);
  const activeIndex = activeSlug ? headings.findIndex((h) => h.slug === activeSlug) : -1;

  function handleNav(index: number, slug: string) {
    const detail: OutlineNavDetail = {
      index,
      slug,
      mode: isSourceMode ? 'source' : 'wysiwyg',
    };
    if (detail.mode === 'source') {
      rememberPendingSourceNavigation(docName, { kind: 'outline', detail });
    }
    window.dispatchEvent(new CustomEvent(OUTLINE_NAV_EVENT, { detail }));
  }

  return (
    <PanelOutlineList
      className={className}
      title={<Trans>Outline</Trans>}
      items={headings.map((heading, index) => ({
        key: `${heading.slug}-${index}`,
        title: heading.text,
        depth: Math.max(0, heading.level - 1),
        onSelect: () => handleNav(index, heading.slug),
      }))}
      activeIndex={activeIndex}
      ariaLabel={t`Document outline`}
      loading={isLoading}
      error={error ? (error instanceof Error ? error.message : t`Failed to load headings`) : null}
      emptyText={<Trans>No headings yet.</Trans>}
    />
  );
}
