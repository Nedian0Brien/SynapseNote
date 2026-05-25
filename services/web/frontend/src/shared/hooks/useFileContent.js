import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest, encodePath } from '../api/apiClient';

/**
 * 파일 내용을 읽고 저장하는 훅.
 * GET /api/documents/{path} → { success, data: { content } }
 * PUT /api/documents/{path} body { content } → { success, data }
 */
export function useFileContent(path, { onUnauthorized } = {}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);
  const pendingContentRef = useRef(null);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const resolvedPath = encodePath(path);
      const json = await apiRequest(`/api/documents/${resolvedPath}`, {
        onUnauthorized,
        errorMessage: (status) => `document load failed: ${status}`,
      });
      if (!json) return;
      setContent(json.data?.content ?? '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (newContent) => {
    if (!path) return;
    setSaving(true);
    try {
      const resolvedPath = encodePath(path);
      const json = await apiRequest(`/api/documents/${resolvedPath}`, {
        method: 'PUT',
        onUnauthorized,
        errorMessage: (status) => `document save failed: ${status}`,
        body: JSON.stringify({ content: newContent }),
      });
      if (!json) return;
      setContent(newContent);
      pendingContentRef.current = null;
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [path, onUnauthorized]);

  const debouncedSave = useCallback((newContent) => {
    pendingContentRef.current = newContent;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save(newContent);
    }, 1000);
  }, [save]);

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    if (pendingContentRef.current == null) return;
    await save(pendingContentRef.current);
  }, [save]);

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingContentRef.current != null) {
      void save(pendingContentRef.current);
    }
  }, [save]);

  return { content, loading, error, saving, save, debouncedSave, flush };
}
