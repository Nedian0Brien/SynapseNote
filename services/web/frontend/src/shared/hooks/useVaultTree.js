import { useState, useEffect, useCallback } from 'react';
import { apiRequest, encodePath } from '../api/apiClient';
import { useVaultEvents } from './useVaultEvents';

/**
 * Vault 파일 트리를 가져오는 훅.
 * /api/nodes → 디렉터리/문서를 트리 구조로 변환한다.
 */
export function useVaultTree({ onUnauthorized } = {}) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiRequest('/api/nodes', {
        onUnauthorized,
        errorMessage: (status) => `nodes fetch failed: ${status}`,
      });
      if (!payload) return;
      setTree(buildTree(payload.data ?? []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => { fetch_(); }, [fetch_]);

  useVaultEvents(useCallback((event) => {
    if (event.type === 'document_changed') {
      void fetch_();
    }
  }, [fetch_]));

  const createFile = useCallback(async (path, content = '') => {
    const json = await apiRequest('/api/documents', {
      method: 'POST',
      onUnauthorized,
      errorMessage: (status) => `create file failed: ${status}`,
      body: JSON.stringify({ path, content }),
    });
    if (!json) return null;
    await fetch_();
    return json.data ?? null;
  }, [fetch_, onUnauthorized]);

  const renameFile = useCallback(async (oldPath, newPath) => {
    const resolvedOldPath = encodePath(oldPath);
    const json = await apiRequest(`/api/documents/${resolvedOldPath}/move`, {
      method: 'POST',
      onUnauthorized,
      errorMessage: (status) => `rename file failed: ${status}`,
      body: JSON.stringify({ new_path: newPath }),
    });
    if (!json) return null;
    await fetch_();
    return json.data ?? null;
  }, [fetch_, onUnauthorized]);

  const deleteFile = useCallback(async (path) => {
    const resolvedPath = encodePath(path);
    const json = await apiRequest(`/api/documents/${resolvedPath}`, {
      method: 'DELETE',
      onUnauthorized,
      errorMessage: (status) => `delete file failed: ${status}`,
    });
    if (!json) return null;
    await fetch_();
    return json.data ?? null;
  }, [fetch_, onUnauthorized]);

  return {
    tree,
    loading,
    error,
    refetch: fetch_,
    createFile,
    renameFile,
    deleteFile,
  };
}

function buildTree(flatItems) {
  const dirs = new Map();
  const root = [];
  const items = flatItems
    .filter((item) => item.id && item.id !== '.')
    .map((item) => ({
      path: item.id,
      name: item.type === 'Directory'
        ? item.title
        : String(item.id).split('/').pop()?.replace(/\.md$/, '') ?? item.title,
      type: item.type === 'Directory' ? 'dir' : 'file',
    }));

  // Ensure parent directories exist
  for (const item of items) {
    const parts = item.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/');
      if (!dirs.has(dirPath)) {
        dirs.set(dirPath, {
          path: dirPath,
          name: parts[i - 1],
          type: 'dir',
          children: [],
        });
      }
    }
  }

  // Add files to their parent directory
  for (const item of items) {
    const parts = item.path.split('/');
    const entry = { ...item, children: item.type === 'dir' ? [] : undefined };

    if (parts.length === 1) {
      root.push(entry);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = dirs.get(parentPath);
      if (parent) parent.children.push(entry);
    }
  }

  // Add orphan dirs to root
  for (const [dirPath, dir] of dirs) {
    if (!dirPath.includes('/')) root.push(dir);
  }

  root.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });

  return root;
}
