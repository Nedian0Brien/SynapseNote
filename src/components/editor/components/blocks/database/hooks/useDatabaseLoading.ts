import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { View, YDoc } from '@/application/types';

import { useRetryFunction } from './useRetryFunction';

interface UseDatabaseLoadingProps {
  viewId: string;
  loadView?: (viewId: string) => Promise<YDoc | null>;
  loadViewMeta?: (viewId: string, callback?: (meta: View | null) => void) => Promise<View | null>;
}

export const useDatabaseLoading = ({ viewId, loadView, loadViewMeta }: UseDatabaseLoadingProps) => {
  const [notFound, setNotFound] = useState(false);
  const [doc, setDoc] = useState<YDoc | null>(null);
  const [selectedViewId, setSelectedViewId] = useState<string>(viewId);
  const [visibleViewIds, setVisibleViewIds] = useState<string[]>([]);
  const [iidName, setIidName] = useState<string>('');

  const viewIdsRef = useRef<string[]>([viewId]);

  const handleError = useCallback(() => {
    setNotFound(true);
  }, []);

  const retryLoadView = useRetryFunction(loadView, handleError);
  const retryLoadViewMeta = useRetryFunction(loadViewMeta, handleError);

  const updateVisibleViewIds = useCallback(async (meta: View | null) => {
    if (!meta) {
      return;
    }

    const viewIds = meta.children.map((v) => v.view_id) || [];

    viewIds.unshift(meta.view_id);

    setIidName(meta.name);
    setVisibleViewIds(viewIds);
  }, []);

  const loadViewMetaWithCallback = useCallback(
    async (id: string, callback?: (meta: View | null) => void) => {
      if (id === viewId) {
        const meta = await retryLoadViewMeta(viewId, updateVisibleViewIds);

        if (meta) {
          await updateVisibleViewIds(meta);
          setNotFound(false);
          return meta;
        }

        return Promise.reject(new Error('View not found'));
      } else {
        const meta = await retryLoadViewMeta(id, callback);

        if (meta) {
          setNotFound(false);
          return meta;
        }

        return Promise.reject(new Error('View not found'));
      }
    },
    [retryLoadViewMeta, updateVisibleViewIds, viewId]
  );

  const onChangeView = useCallback((viewId: string) => {
    setSelectedViewId(viewId);
  }, []);

  useEffect(() => {
    if (!viewId) return;
    
    const loadViewData = async () => {
      try {
        const view = await retryLoadView(viewId);

        setDoc(view);
        setNotFound(false);
      } catch (error) {
        setNotFound(true);
      }
    };

    void loadViewData();
  }, [viewId, retryLoadView]);

  useEffect(() => {
    viewIdsRef.current = visibleViewIds;
  }, [visibleViewIds]);

  useLayoutEffect(() => {
    void loadViewMetaWithCallback(viewId).then(() => {
      if (!viewIdsRef.current.includes(viewId) && viewIdsRef.current.length > 0) {
        setSelectedViewId(viewIdsRef.current[0]);
      } else {
        setSelectedViewId(viewId);
      }

      setNotFound(false);
    }).catch(() => {
      setNotFound(true);
    });
  }, [loadViewMetaWithCallback, viewId]);

  return {
    notFound,
    doc,
    selectedViewId,
    visibleViewIds,
    iidName,
    onChangeView,
    loadViewMeta: loadViewMetaWithCallback,
  };
};