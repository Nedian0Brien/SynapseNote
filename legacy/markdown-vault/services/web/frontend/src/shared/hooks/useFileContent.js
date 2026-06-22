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
  const [syncStatus, setSyncStatus] = useState('current');
  const saveTimer = useRef(null);
  const pendingContentRef = useRef(null);
  const currentHashRef = useRef(null);
  const savingRef = useRef(false);

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
      currentHashRef.current = json.data?.hash ?? null;
      pendingContentRef.current = null;
      setSyncStatus('current');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (newContent, { force = false } = {}) => {
    if (!path) return;
    setSaving(true);
    setError(null);
    savingRef.current = true;
    try {
      const resolvedPath = encodePath(path);
      const body = { content: newContent };
      if (!force && currentHashRef.current) {
        body.baseHash = currentHashRef.current;
      }
      const json = await apiRequest(`/api/documents/${resolvedPath}`, {
        method: 'PUT',
        onUnauthorized,
        errorMessage: (status) => `document save failed: ${status}`,
        body: JSON.stringify(body),
      });
      if (!json) return;
      setContent(newContent);
      currentHashRef.current = json.data?.hash ?? currentHashRef.current;
      pendingContentRef.current = null;
      setSyncStatus('current');
    } catch (e) {
      if (e.status === 409) {
        setSyncStatus('conflict');
        setError('다른 위치에서 먼저 저장된 변경이 있습니다.');
        return;
      }
      setError(e.message);
    } finally {
      setSaving(false);
      savingRef.current = false;
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

  const keepLocalVersion = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const localContent = pendingContentRef.current ?? content;
    await save(localContent, { force: true });
  }, [content, save]);

  const loadRemoteVersion = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingContentRef.current = null;
    await load();
  }, [load]);

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingContentRef.current != null) {
      void save(pendingContentRef.current);
    }
  }, [save]);

  useEffect(() => {
    if (!path || typeof EventSource === 'undefined') return undefined;

    const source = new EventSource('/api/vault/events', { withCredentials: true });

    const handleVaultEvent = (message) => {
      let event;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }

      if (event.type !== 'document_changed') return;
      if (event.path !== path && event.oldPath !== path) return;

      if (event.action === 'deleted') {
        if (pendingContentRef.current != null || savingRef.current) {
          setSyncStatus('conflict');
          setError('편집 중인 문서가 다른 위치에서 삭제되었습니다.');
          return;
        }
        currentHashRef.current = null;
        setSyncStatus('deleted');
        setError('문서가 삭제되었습니다.');
        return;
      }

      if (event.action === 'moved' && event.oldPath === path) {
        setSyncStatus('moved');
        setError('문서 위치가 변경되었습니다.');
        return;
      }

      if (!event.hash || event.hash === currentHashRef.current) {
        return;
      }

      if (pendingContentRef.current != null || savingRef.current) {
        setSyncStatus('remote_changed');
        setError('편집 중에 다른 위치에서 변경되었습니다.');
        return;
      }

      currentHashRef.current = event.hash;
      void load();
    };

    const handleError = () => {
      setSyncStatus((status) => (status === 'current' ? 'disconnected' : status));
    };

    source.addEventListener('vault', handleVaultEvent);
    source.addEventListener('error', handleError);

    return () => {
      source.removeEventListener('vault', handleVaultEvent);
      source.removeEventListener('error', handleError);
      source.close();
    };
  }, [path, load]);

  return {
    content,
    loading,
    error,
    saving,
    syncStatus,
    save,
    debouncedSave,
    flush,
    reload: load,
    keepLocalVersion,
    loadRemoteVersion,
  };
}
