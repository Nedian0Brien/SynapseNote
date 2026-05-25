import { useCallback, useEffect, useState } from 'react';
import { apiRequest, encodePath } from '../api/apiClient';

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
      const resolvedPath = encodePath(path);
      const json = await apiRequest(`/api/nodes/${resolvedPath}/backlinks`, {
        onUnauthorized,
        errorMessage: (status) => `backlinks fetch failed: ${status}`,
      });
      if (!json) return;
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
