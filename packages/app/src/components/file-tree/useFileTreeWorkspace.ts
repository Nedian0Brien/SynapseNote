import { WorkspaceSuccessSchema } from '@nedian0brien/synapsenote-core';
import { useEffect, useState } from 'react';
import { parseSuccessOrWarn } from '@/lib/parse-server-response';

export type FileTreeWorkspace = {
  contentDir: string;
  pathSeparator: '/' | '\\';
};

/** Loads the workspace path metadata used by local-path context menu actions. */
export function useFileTreeWorkspace() {
  const [workspace, setWorkspace] = useState<FileTreeWorkspace | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/workspace')
      .then(async (res) => {
        const data = await res.json();
        if (!active || !res.ok) return;
        const parsed = parseSuccessOrWarn(WorkspaceSuccessSchema, data, 'workspace', null);
        if (!parsed) return;
        setWorkspace({ contentDir: parsed.contentDir, pathSeparator: parsed.pathSeparator });
      })
      .catch((err) => {
        console.warn('[FileTree] /api/workspace fetch failed:', err);
      });
    return () => {
      active = false;
    };
  }, []);
  return workspace;
}
