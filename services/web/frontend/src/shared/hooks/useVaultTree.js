import { useState, useEffect, useCallback } from 'react';

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
      const res = await fetch('/api/nodes', { credentials: 'include' });
      if (res.status === 401) { onUnauthorized?.(); return; }
      if (!res.ok) throw new Error(`nodes fetch failed: ${res.status}`);
      const payload = await res.json();
      setTree(buildTree(payload.data ?? []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const createFile = useCallback(async (path, content = '') => {
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (res.status === 401) {
      onUnauthorized?.();
      return null;
    }
    if (!res.ok) throw new Error(`create file failed: ${res.status}`);
    const json = await res.json();
    await fetch_();
    return json.data ?? null;
  }, [fetch_, onUnauthorized]);

  const renameFile = useCallback(async (oldPath, newPath) => {
    const resolvedOldPath = oldPath.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(`/api/documents/${resolvedOldPath}/move`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_path: newPath }),
    });
    if (res.status === 401) {
      onUnauthorized?.();
      return null;
    }
    if (!res.ok) throw new Error(`rename file failed: ${res.status}`);
    const json = await res.json();
    await fetch_();
    return json.data ?? null;
  }, [fetch_, onUnauthorized]);

  const deleteFile = useCallback(async (path) => {
    const resolvedPath = path.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(`/api/documents/${resolvedPath}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.status === 401) {
      onUnauthorized?.();
      return null;
    }
    if (!res.ok) throw new Error(`delete file failed: ${res.status}`);
    const json = await res.json();
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
