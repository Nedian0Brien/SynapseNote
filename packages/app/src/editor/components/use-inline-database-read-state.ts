import { t } from '@lingui/core/macro';
import { DatabaseLinkedViewReferenceSchema } from '@nedian0brien/synapsenote-core';
import { useEffect } from 'react';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import { subscribeToDatabaseAgentRunChanged } from '@/lib/database-agent-run-events';
import { resolveDatabaseLinkedView, useDatabaseReadModel } from '@/lib/database-read-model';
import { subscribeToDatabaseChanged } from '@/lib/documents-events';
import type { InlineDatabaseReference, InlineDatabaseReferenceData } from './inline-database-types';
import { applyInlineOptimisticValues } from './inline-database-utils';
import type { useInlineDatabaseControllerState } from './use-inline-database-controller-state';
import { useInlineDatabaseReference } from './use-inline-database-reference';

type InlineControllerState = ReturnType<typeof useInlineDatabaseControllerState>;

export interface UseInlineDatabaseReadStateOptions {
  reference: InlineDatabaseReference;
  referenceData: InlineDatabaseReferenceData;
  databaseId?: string;
  sourceId?: string;
  viewId?: string;
  mode?: 'inline' | 'full-page';
  controller: InlineControllerState;
}

export function useInlineDatabaseReadState({
  reference,
  referenceData,
  databaseId,
  sourceId,
  viewId,
  mode,
  controller,
}: UseInlineDatabaseReadStateOptions) {
  'use no memo';
  const {
    localViewOverrides,
    setLocalViewOverrides,
    refresh,
    scheduleRefresh,
    showArchived,
    inlineSearchRequest,
    inlineSearchPageCursor,
    inlineSearchQuery,
    setInlineSearchPageCursor,
    setInlineSearchRequest,
    inlineSearchSurfaceKeyRef,
    inlineTitleEditing,
    setInlineTitleDraft,
    setFocusInlineNewRecordRequest,
    setInlineSearchOpen,
    setInlineSearchQuery,
    setReplacementPickerOpen,
    inlineSelectedRecordIds,
    inlineAgentScopeOverride,
    setInlineAgentScopeOverride,
    setInlineAgentMenuOpen,
    inlineOptimisticCellValues,
  } = controller;

  const state = useDatabaseReadModel(
    reference.success
      ? {
          databaseId: referenceData.databaseId,
          sourceId: referenceData.sourceId,
          viewId: referenceData.viewId,
          viewOverrides: localViewOverrides ?? referenceData.viewOverrides,
          mode: referenceData.mode,
          showArchived,
          search: inlineSearchRequest,
          pageCursor: inlineSearchPageCursor,
          refreshKey: refresh,
        }
      : null,
  );

  const inlineSearchSurfaceKey = reference.success
    ? [
        referenceData.databaseId,
        referenceData.sourceId,
        referenceData.viewId,
        JSON.stringify(localViewOverrides ?? null),
      ].join('\0')
    : 'unresolved';

  // A cursor is valid only for one canonical view/search snapshot. Any
  // reference or projection change must restart at the first page.
  useEffect(() => {
    const nextSearch = inlineSearchQuery.trim();
    const timer = globalThis.setTimeout(() => {
      setInlineSearchPageCursor(null);
      setInlineSearchRequest(nextSearch);
    }, 200);
    return () => globalThis.clearTimeout(timer);
  }, [inlineSearchQuery, setInlineSearchPageCursor, setInlineSearchRequest]);

  useEffect(() => {
    if (inlineSearchSurfaceKeyRef.current === inlineSearchSurfaceKey) return;
    inlineSearchSurfaceKeyRef.current = inlineSearchSurfaceKey;
    setInlineSearchPageCursor(null);
  }, [inlineSearchSurfaceKey, inlineSearchSurfaceKeyRef, setInlineSearchPageCursor]);

  useEffect(() => {
    if (state.status !== 'ready' || inlineTitleEditing) return;
    setInlineTitleDraft(state.description.source?.name ?? state.description.database.name);
  }, [inlineTitleEditing, setInlineTitleDraft, state]);

  useEffect(() => {
    const parsed = DatabaseLinkedViewReferenceSchema.safeParse({
      databaseId,
      sourceId,
      viewId,
      ...(mode ? { mode } : {}),
    });
    if (!parsed.success) return;
    return subscribeToDatabaseChanged((payload) => {
      if (
        payload.scope === 'workspace' ||
        payload.databaseIds.includes(parsed.data.databaseId) ||
        payload.sourceIds.includes(parsed.data.sourceId)
      ) {
        scheduleRefresh();
      }
    });
  }, [databaseId, mode, scheduleRefresh, sourceId, viewId]);

  useEffect(() => {
    const parsed = DatabaseLinkedViewReferenceSchema.safeParse({
      databaseId,
      sourceId,
      viewId,
      ...(mode ? { mode } : {}),
    });
    if (!parsed.success) return;
    return subscribeToDatabaseAgentRunChanged((detail) => {
      if (detail.databaseIds.length === 0 || detail.databaseIds.includes(parsed.data.databaseId)) {
        scheduleRefresh();
      }
    });
  }, [databaseId, mode, scheduleRefresh, sourceId, viewId]);

  const linkedSource = state.status === 'ready' ? state.description.source : null;
  const linkedDatabase = state.status === 'ready' ? state.description.database : null;
  const linkedView =
    state.status === 'ready'
      ? state.description.database.views.find(
          (view) => view.id === (state.resolvedViewId ?? referenceData.viewId),
        )
      : undefined;
  const activeLinkedView = linkedView
    ? resolveDatabaseLinkedView(linkedView, localViewOverrides ?? referenceData.viewOverrides)
    : undefined;
  const inlineVisiblePropertyIds =
    activeLinkedView?.projection.propertyIds?.length && linkedSource
      ? activeLinkedView.projection.propertyIds
      : (linkedSource?.properties.map((property) => property.id) ?? []);
  const inlineDatabaseContext =
    state.status === 'ready'
      ? `${state.description.source?.name ?? state.description.database.name} · ${activeLinkedView?.name ?? 'view'}`
      : null;
  const inlineViewActionsLabel = inlineDatabaseContext
    ? t`Database view actions for ${inlineDatabaseContext}`
    : t`Database view actions`;
  const inlineSearchLabel = inlineDatabaseContext
    ? t`Search pages in ${inlineDatabaseContext}`
    : t`Search pages`;
  const inlineOpenDatabaseLabel = inlineDatabaseContext
    ? t`Open full database: ${inlineDatabaseContext}`
    : t`Open full database`;
  const inlineAgentLabel = inlineDatabaseContext
    ? t`Ask agent about ${inlineDatabaseContext}`
    : undefined;
  const inlineNewViewLabel = inlineDatabaseContext
    ? t`New database view for ${inlineDatabaseContext}`
    : t`New database view`;
  const linkedDatabaseRegionLabel = inlineDatabaseContext
    ? t`Linked database view: ${inlineDatabaseContext}`
    : t`Linked database view`;
  const linkedSourceViews =
    linkedDatabase?.views.filter((view) => view.sourceId === referenceData.sourceId) ?? [];
  const defaultInlineAgentScope: DatabaseAgentScope = {
    databaseId: referenceData.databaseId,
    sourceId: referenceData.sourceId,
    viewId: referenceData.viewId,
    ...(inlineSelectedRecordIds.size > 0 ? { recordIds: [...inlineSelectedRecordIds] } : {}),
  };
  const activeInlineAgentScope = inlineAgentScopeOverride ?? defaultInlineAgentScope;
  const openInlineAgentScope = (scope: DatabaseAgentScope) => {
    setInlineAgentScopeOverride(scope);
    setInlineAgentMenuOpen(true);
  };
  const handleInlineAgentMenuChange = (nextOpen: boolean) => {
    setInlineAgentMenuOpen(nextOpen);
    if (!nextOpen) setInlineAgentScopeOverride(null);
  };
  const baseRenderedResult =
    state.status === 'ready' && state.result
      ? applyInlineOptimisticValues(state.result, inlineOptimisticCellValues)
      : state.status === 'ready'
        ? state.result
        : null;
  const searchNeedle = inlineSearchQuery.trim();
  const renderedResult = baseRenderedResult;
  const loadMoreInlineSearch = () => {
    if (!searchNeedle || state.status !== 'ready' || !state.result?.nextCursor) return;
    setInlineSearchPageCursor(state.result.nextCursor);
  };

  const referenceController = useInlineDatabaseReference({
    reference,
    localViewOverrides,
    setLocalViewOverrides,
    setFocusInlineNewRecord: (focus) =>
      setFocusInlineNewRecordRequest((current) => (focus ? (current ?? 0) + 1 : null)),
    setInlineSearchOpen,
    setInlineSearchQuery,
    setReplacementPickerOpen,
  });

  return {
    state,
    linkedSource,
    linkedDatabase,
    linkedView,
    activeLinkedView,
    inlineVisiblePropertyIds,
    inlineDatabaseContext,
    inlineViewActionsLabel,
    inlineSearchLabel,
    inlineOpenDatabaseLabel,
    inlineAgentLabel,
    inlineNewViewLabel,
    linkedDatabaseRegionLabel,
    linkedSourceViews,
    activeInlineAgentScope,
    openInlineAgentScope,
    handleInlineAgentMenuChange,
    renderedResult,
    searchNeedle,
    loadMoreInlineSearch,
    ...referenceController,
  };
}
