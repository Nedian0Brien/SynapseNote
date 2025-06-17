import React, { useCallback, useEffect, useState } from 'react';
import * as Y from 'yjs';

import {
  DatabaseContextState,
  getPrimaryFieldId,
  parseRelationTypeOption,
  useDatabaseContext,
  useFieldSelector,
} from '@/application/database-yjs';
import { RelationCell, RelationCellData } from '@/application/database-yjs/cell.type';
import { View, YDatabase, YDoc, YjsEditorKey } from '@/application/types';
import { RelationPrimaryValue } from '@/components/database/components/cell/relation/RelationPrimaryValue';
import { notify } from '@/components/_shared/notify';
import { cn } from '@/lib/utils';

function RelationItems({
  style,
  cell,
  fieldId,
  wrap,
}: {
  cell: RelationCell;
  fieldId: string;
  style?: React.CSSProperties;
  wrap: boolean;
}) {
  const context = useDatabaseContext();
  const viewId = context.iidIndex;
  const { field } = useFieldSelector(fieldId);
  const relatedDatabaseId = field ? parseRelationTypeOption(field)?.database_id : null;

  const createRowDoc = context.createRowDoc;
  const loadViewMeta = context.loadViewMeta;
  const loadView = context.loadView;
  const navigateToRow = context.navigateToRow;

  const [noAccess, setNoAccess] = useState(false);
  const [relations, setRelations] = useState<Record<string, string> | null>();
  const [rows, setRows] = useState<DatabaseContextState['rowDocMap'] | null>();
  const [relatedFieldId, setRelatedFieldId] = useState<string | undefined>();
  const relatedViewId = relatedDatabaseId ? relations?.[relatedDatabaseId] : null;
  const [docGuid, setDocGuid] = useState<string | null>(null);

  const [rowIds, setRowIds] = useState([] as string[]);

  const navigateToView = context.navigateToView;

  useEffect(() => {
    if (!viewId) return;

    const update = (meta: View | null) => {
      if (!meta) return;
      setRelations(meta.database_relations);
    };

    try {
      void loadViewMeta?.(viewId, update);
    } catch (e) {
      console.error(e);
    }
  }, [loadViewMeta, viewId]);

  const handleUpdateRowIds = useCallback(() => {
    const data = cell?.data;

    if (!data || !(data instanceof Y.Array<string>)) {
      setRowIds([]);
      return;
    }

    const ids = (data.toJSON() as RelationCellData) ?? [];

    setRowIds(ids);
  }, [cell.data]);

  useEffect(() => {
    if (!relatedViewId || !createRowDoc || !docGuid) return;
    void (async () => {
      try {
        const rows: Record<string, YDoc> = {};

        for (const rowId of rowIds) {
          const rowDoc = await createRowDoc(`${docGuid}_rows_${rowId}`);

          rows[rowId] = rowDoc;
        }

        setRows(rows);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [createRowDoc, relatedViewId, relatedFieldId, rowIds, docGuid]);

  useEffect(() => {
    handleUpdateRowIds();
  }, [handleUpdateRowIds]);

  useEffect(() => {
    if (!relatedViewId) return;

    void (async () => {
      try {
        const viewDoc = await loadView?.(relatedViewId);

        if (!viewDoc) {
          throw new Error('No access');
        }

        setDocGuid(viewDoc.guid);
        const database = viewDoc.getMap(YjsEditorKey.data_section).get(YjsEditorKey.database) as YDatabase;
        const fieldId = getPrimaryFieldId(database);

        setNoAccess(!fieldId);
        setRelatedFieldId(fieldId);
      } catch (e) {
        console.error(e);
        setNoAccess(true);
      }
    })();
  }, [loadView, relatedViewId]);

  return (
    <div
      style={style}
      className={cn(
        'relation-cell flex w-full gap-2 overflow-hidden',
        wrap ? 'flex-wrap whitespace-pre-wrap break-words' : 'flex-nowrap'
      )}
    >
      {noAccess ? (
        <div className={'text-text-secondary'}>No access</div>
      ) : (
        rowIds.map((rowId) => {
          const rowDoc = rows?.[rowId];

          if (!rowDoc) return null;
          return (
            <div
              key={rowId}
              onClick={async (e) => {
                if (!relatedViewId) return;
                e.stopPropagation();

                try {
                  if (navigateToRow) {
                    navigateToRow(rowId, relatedViewId !== viewId ? relatedViewId : undefined);
                    return;
                  }

                  await navigateToView?.(relatedViewId);
                  // eslint-disable-next-line
                } catch (e: any) {
                  notify.error(e.message);
                }
              }}
              className={`min-w-fit overflow-hidden text-text-primary underline ${
                relatedViewId ? 'cursor-pointer hover:text-text-action' : ''
              }`}
            >
              <RelationPrimaryValue fieldId={relatedFieldId} rowDoc={rowDoc} />
            </div>
          );
        })
      )}
    </div>
  );
}

export default RelationItems;
