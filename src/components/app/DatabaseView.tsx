import { Suspense, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ViewComponentProps, ViewLayout, YDatabase, YjsEditorKey } from '@/application/types';
import { useAppOutline } from '@/components/app/app.hooks';
import { Database } from '@/components/database';
import { findView } from '@/components/_shared/outline/utils';
import ComponentLoading from '@/components/_shared/progress/ComponentLoading';
import CalendarSkeleton from '@/components/_shared/skeleton/CalendarSkeleton';
import DocumentSkeleton from '@/components/_shared/skeleton/DocumentSkeleton';
import GridSkeleton from '@/components/_shared/skeleton/GridSkeleton';
import KanbanSkeleton from '@/components/_shared/skeleton/KanbanSkeleton';

import ViewMetaPreview from 'src/components/view-meta/ViewMetaPreview';

function DatabaseView(props: ViewComponentProps) {
  const { viewMeta, uploadFile } = props;
  const [search, setSearch] = useSearchParams();
  const outline = useAppOutline();
  const iidIndex = viewMeta.viewId;
  const view = useMemo(() => {
    if (!outline || !iidIndex) return;
    return findView(outline || [], iidIndex);
  }, [outline, iidIndex]);

  const visibleViewIds = useMemo(() => {
    if (!view) return [];
    return [view.view_id, ...(view.children?.map((v) => v.view_id) || [])];
  }, [view]);

  const viewId = useMemo(() => {
    return search.get('v') || iidIndex;
  }, [search, iidIndex]);

  const handleChangeView = useCallback(
    (viewId: string) => {
      setSearch((prev) => {
        prev.set('v', viewId);
        return prev;
      });
    },
    [setSearch]
  );

  const handleNavigateToRow = useCallback(
    (rowId: string) => {
      setSearch((prev) => {
        prev.set('r', rowId);
        return prev;
      });
    },
    [setSearch]
  );

  const rowId = search.get('r') || undefined;
  const doc = props.doc;
  const database = doc?.getMap(YjsEditorKey.data_section)?.get(YjsEditorKey.database) as YDatabase;
  const skeleton = useMemo(() => {
    if (rowId) {
      return <DocumentSkeleton />;
    }

    switch (viewMeta.layout) {
      case ViewLayout.Grid:
        return <GridSkeleton includeTitle={false} />;
      case ViewLayout.Board:
        return <KanbanSkeleton includeTitle={false} />;
      case ViewLayout.Calendar:
        return <CalendarSkeleton includeTitle={false} />;
      default:
        return <ComponentLoading />;
    }
  }, [rowId, viewMeta.layout]);

  if (!viewId || !doc || !database) return null;

  return (
    <div
      style={{
        minHeight: viewMeta.layout === ViewLayout.Calendar ? 'calc(100vh - 48px)' : undefined,
      }}
      className={'relative flex h-full w-full flex-col'}
    >
      {rowId ? null : (
        <ViewMetaPreview
          {...viewMeta}
          readOnly={props.readOnly}
          updatePage={props.updatePage}
          updatePageIcon={props.updatePageIcon}
          updatePageName={props.updatePageName}
          uploadFile={uploadFile}
        />
      )}

      <Suspense fallback={skeleton}>
        <Database
          iidName={viewMeta.name || ''}
          iidIndex={iidIndex || ''}
          {...props}
          viewId={viewId}
          rowId={rowId}
          showActions={true}
          visibleViewIds={visibleViewIds}
          onChangeView={handleChangeView}
          onOpenRowPage={handleNavigateToRow}
        />
      </Suspense>
    </div>
  );
}

export default DatabaseView;
