import { useState, useEffect, useCallback, useRef } from 'react';

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
      const resolvedPath = path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/documents/${resolvedPath}`, { credentials: 'include' });
      if (res.status === 401) { onUnauthorized?.(); return; }
      if (!res.ok) throw new Error(`document load failed: ${res.status}`);
      const json = await res.json();
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
      const resolvedPath = path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/documents/${resolvedPath}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      if (res.status === 401) { onUnauthorized?.(); return; }
      if (!res.ok) throw new Error(`document save failed: ${res.status}`);
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
