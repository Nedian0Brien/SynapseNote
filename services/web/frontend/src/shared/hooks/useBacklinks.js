import { useCallback, useEffect, useState } from 'react';

export function useBacklinks(path, { onUnauthorized } = {}) {
  const [backlinks, setBacklinks] = useState([]);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);

  const fetchBacklinks = useCallback(async () => {
    if (!path) {
      setBacklinks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const resolvedPath = path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/nodes/${resolvedPath}/backlinks`, {
        credentials: 'include',
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!res.ok) throw new Error(`backlinks fetch failed: ${res.status}`);
      const json = await res.json();
      setBacklinks(json.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, path]);

  useEffect(() => {
    fetchBacklinks();
  }, [fetchBacklinks]);

  return { backlinks, loading, error, refetch: fetchBacklinks };
}
