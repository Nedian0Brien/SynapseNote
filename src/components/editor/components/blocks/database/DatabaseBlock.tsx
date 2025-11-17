import { forwardRef, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Element } from 'slate';
import { useReadOnly, useSlateStatic } from 'slate-react';

import { DatabaseContextState } from '@/application/database-yjs';
import { YjsEditorKey, YSharedRoot } from '@/application/types';
import { DatabaseNode, EditorElementProps } from '@/components/editor/editor.type';
import { useEditorContext } from '@/components/editor/EditorContext';

import { DatabaseContent } from './components/DatabaseContent';
import { useDatabaseLoading } from './hooks/useDatabaseLoading';
import { useResizePositioning } from './hooks/useResizePositioning';

export const DatabaseBlock = memo(
  forwardRef<HTMLDivElement, EditorElementProps<DatabaseNode>>(({ node, children, ...attributes }, ref) => {
    const viewId = node.data.view_id;
    const context = useEditorContext();
    const workspaceId = context.workspaceId;
    const navigateToView = context?.navigateToView;
    const loadView = context?.loadView;
    const createRowDoc = context?.createRowDoc;

    const [hasDatabase, setHasDatabase] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editor = useSlateStatic();
    const readOnly = useReadOnly() || editor.isElementReadOnly(node as unknown as Element);

    const { notFound, doc, selectedViewId, visibleViewIds, iidName, onChangeView, loadViewMeta } = useDatabaseLoading({
      viewId,
      loadView,
      loadViewMeta: context?.loadViewMeta,
    });

    const handleNavigateToRow = useCallback(
      async (rowId: string) => {
        if (!viewId) return;
        await navigateToView?.(viewId, rowId);
      },
      [navigateToView, viewId]
    );

    const { paddingStart, paddingEnd, width } = useResizePositioning({
      editor,
      node: node as unknown as Element,
    });

    useEffect(() => {
      const sharedRoot = doc?.getMap(YjsEditorKey.data_section) as YSharedRoot;

      if (!sharedRoot) return;

      const setStatus = () => {
        setHasDatabase(!!sharedRoot.get(YjsEditorKey.database));
      };

      setStatus();
      sharedRoot.observe(setStatus);

      return () => {
        sharedRoot.unobserve(setStatus);
      };
    }, [doc]);

    return (
      <div {...attributes} contentEditable={readOnly ? false : undefined} className='relative w-full cursor-pointer'>
        <div ref={ref} className='absolute left-0 top-0 h-full w-full caret-transparent'>
          {children}
        </div>
        <div
          contentEditable={false}
          ref={containerRef}
          className='container-bg relative my-1 flex w-full select-none flex-col'
        >
          <DatabaseContent
            selectedViewId={selectedViewId}
            hasDatabase={hasDatabase}
            notFound={notFound}
            paddingStart={paddingStart}
            paddingEnd={paddingEnd}
            width={width}
            doc={doc}
            workspaceId={workspaceId}
            viewId={viewId}
            createRowDoc={createRowDoc}
            loadView={loadView}
            navigateToView={navigateToView}
            onOpenRowPage={handleNavigateToRow}
            loadViewMeta={loadViewMeta}
            iidName={iidName}
            visibleViewIds={visibleViewIds}
            onChangeView={onChangeView}
            // eslint-disable-next-line
            context={context as DatabaseContextState}
          />
        </div>
      </div>
    );
  }),
  (prevProps, nextProps) => prevProps.node.data.view_id === nextProps.node.data.view_id
);

export default DatabaseBlock;
