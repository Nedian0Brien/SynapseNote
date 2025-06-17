import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { RowMetaKey, useDatabaseContext, useReadOnly, useRowMetaSelector } from '@/application/database-yjs';
import { useUpdateRowMetaDispatch } from '@/application/database-yjs/dispatch';
import { YDoc } from '@/application/types';
import { Editor } from '@/components/editor';
import { EditorSkeleton } from '@/components/_shared/skeleton/EditorSkeleton';

const ViewNotFoundCodes = [1040, 1017]; // Error code for "View not found"

export const DatabaseRowSubDocument = memo(({ rowId }: { rowId: string }) => {
  const meta = useRowMetaSelector(rowId);
  const readOnly = useReadOnly();
  const documentId = meta?.documentId;
  const context = useDatabaseContext();

  const { createOrphanedView, loadView } = context;
  const updateRowMeta = useUpdateRowMetaDispatch(rowId);

  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<YDoc | null>(null);

  const handleCreateDocument = useCallback(
    async (documentId: string) => {
      if (!createOrphanedView || !documentId) return;
      try {
        setDoc(null);
        await createOrphanedView({ document_id: documentId });

        const doc = await loadView?.(documentId, true);

        if (doc) {
          setDoc(doc);
        }
        // eslint-disable-next-line
      } catch (e: any) {
        toast.error(e.message);
      }
    },
    [createOrphanedView, loadView]
  );

  const handleOpenDocument = useCallback(
    async (documentId: string) => {
      if (!loadView) return;
      setLoading(true);
      try {
        setDoc(null);
        const doc = await loadView(documentId, true);

        setDoc(doc);
        // eslint-disable-next-line
      } catch (e: any) {
        console.error(e);
        if (ViewNotFoundCodes.includes(e.code)) {
          // This means the document does not exist, so we create a new one
          void handleCreateDocument(documentId);
        } else {
          toast.error(e.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [loadView, handleCreateDocument]
  );

  useEffect(() => {
    if (!documentId) return;
    void handleOpenDocument(documentId);
  }, [handleOpenDocument, documentId]);

  if (loading) {
    return <EditorSkeleton />;
  }

  if (!doc || !documentId) return null;
  return (
    <Editor
      {...context}
      fullWidth
      viewId={documentId}
      doc={doc}
      readOnly={readOnly}
      onWordCountChange={(_, { characters }) => {
        updateRowMeta(RowMetaKey.IsDocumentEmpty, characters <= 0);
      }}
    />
  );
});

export default DatabaseRowSubDocument;
