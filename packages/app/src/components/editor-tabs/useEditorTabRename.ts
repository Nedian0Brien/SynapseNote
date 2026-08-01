import { type RenamedDocMapping, RenamePathSuccessSchema } from '@nedian0brien/synapsenote-core';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  buildRenamedNodePath,
  isValidNodeName,
  normalizeRenameValue,
  planRenameCleanupCalls,
  remapActiveDocName,
} from '@/components/file-tree-operations';
import { captureRenameSnapshots } from '@/editor/editor-cache';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';

const TAB_RENAME_EXTENSIONS = ['.md', '.mdx'] as const;

type Translator = (message: TemplateStringsArray) => string;

function navigateToDoc(docName: string) {
  const nextHash = hashFromDocName(docName);
  if (window.location.hash !== nextHash) window.location.hash = nextHash;
}

export function stripRenameExtensionSuffix(value: string, docExt: string): string {
  const extensions = [docExt, ...TAB_RENAME_EXTENSIONS].filter(
    (ext, index, all) => ext && all.indexOf(ext) === index,
  );
  const lowerValue = value.toLowerCase();
  const extension = extensions.find(
    (ext) => value.length > ext.length && lowerValue.endsWith(ext.toLowerCase()),
  );
  return extension ? value.slice(0, -extension.length) : value;
}

export interface UseEditorTabRenameOptions {
  activeDocName: string | null;
  closeAndClearForRename: (docName: string) => Promise<void>;
  getPoolActiveDocName: () => string | null;
  openTabs: readonly string[];
  pageMeta: ReadonlyMap<string, { docExt?: string }>;
  poolHas: (docName: string) => boolean;
  remapTabsForRename: (renamed: readonly RenamedDocMapping[]) => void;
  t: Translator;
}

export interface EditorTabRenameController {
  cancelRename: () => void;
  commitRename: () => Promise<void>;
  enterRenameMode: (tabId: string, docName: string) => void;
  isRenameLoading: boolean;
  renameError: string | null;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameValue: string;
  renamingTab: { docName: string; tabId: string } | null;
  setRenameError: Dispatch<SetStateAction<string | null>>;
  updateRenameValue: (value: string, docExt: string) => void;
}

/** Owns the async rename transition and its local input/error state. */
export function useEditorTabRename({
  activeDocName,
  closeAndClearForRename,
  getPoolActiveDocName,
  openTabs,
  pageMeta,
  poolHas,
  remapTabsForRename,
  t,
}: UseEditorTabRenameOptions): EditorTabRenameController {
  const [renamingTab, setRenamingTab] = useState<{ docName: string; tabId: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenameLoading, setIsRenameLoading] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const commitInProgressRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const lastFailedValueRef = useRef<string | null>(null);
  const activeDocNameRef = useRef(activeDocName);

  useEffect(() => {
    activeDocNameRef.current = activeDocName;
  }, [activeDocName]);
  useEffect(() => {
    if (!renamingTab) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingTab]);
  useEffect(() => {
    if (!renamingTab || openTabs.includes(renamingTab.tabId)) return;
    cancelRequestedRef.current = true;
    lastFailedValueRef.current = null;
    setRenamingTab(null);
    setRenameValue('');
    setRenameError(null);
    setIsRenameLoading(false);
  }, [openTabs, renamingTab]);

  function enterRenameMode(tabId: string, docName: string) {
    const segments = docName.split('/');
    cancelRequestedRef.current = false;
    lastFailedValueRef.current = null;
    setRenamingTab({ docName, tabId });
    setRenameValue(segments[segments.length - 1]);
    setRenameError(null);
  }

  function cancelRename() {
    cancelRequestedRef.current = true;
    lastFailedValueRef.current = null;
    setRenamingTab(null);
    setRenameValue('');
    setRenameError(null);
    setIsRenameLoading(false);
  }

  function updateRenameValue(value: string, docExt: string) {
    setRenameValue(stripRenameExtensionSuffix(value, docExt));
    setRenameError(null);
    lastFailedValueRef.current = null;
  }

  async function commitRename() {
    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false;
      return;
    }
    if (commitInProgressRef.current) return;
    const docName = renamingTab?.docName;
    if (!docName) {
      cancelRename();
      return;
    }
    const docExt = pageMeta.get(docName)?.docExt ?? '.md';
    const normalized = normalizeRenameValue(
      'file',
      stripRenameExtensionSuffix(renameValue, docExt),
    );
    const segments = docName.split('/');
    const currentName = segments[segments.length - 1];
    if (normalized === currentName) {
      cancelRename();
      return;
    }
    if (normalized === lastFailedValueRef.current) {
      renameInputRef.current?.focus();
      return;
    }
    if (!isValidNodeName(normalized)) {
      setRenameError(t`Name can’t be empty, ".", "..", or contain / or \\`);
      renameInputRef.current?.focus();
      return;
    }
    const newDocName = buildRenamedNodePath(
      { kind: 'file', path: docName, name: currentName },
      normalized,
    );
    commitInProgressRef.current = true;
    setIsRenameLoading(true);
    setRenameError(null);
    try {
      const res = await fetch('/api/rename-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'file', fromPath: docName, toPath: newDocName }),
      });
      if (cancelRequestedRef.current) {
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        return;
      }
      const parsed = await parseServerResponse(res, `Server error (HTTP ${res.status})`);
      if (!parsed.ok) {
        setRenameError(parsed.title);
        setIsRenameLoading(false);
        commitInProgressRef.current = false;
        lastFailedValueRef.current = normalized;
        renameInputRef.current?.focus();
        return;
      }
      const success = parseSuccessOrWarn(RenamePathSuccessSchema, parsed.body, 'rename-path:tab', {
        renamed: [],
        renamedAssets: [],
      });
      const renamed = success.renamed;
      const currentActiveDocName = activeDocNameRef.current;
      const nextActiveDocName = remapActiveDocName(currentActiveDocName, renamed);
      captureRenameSnapshots(renamed);
      let reconcileOk = true;
      try {
        const cleanupDocNames = planRenameCleanupCalls(renamed, getPoolActiveDocName(), poolHas);
        await Promise.all(cleanupDocNames.map((name) => closeAndClearForRename(name)));
        remapTabsForRename(renamed);
        emitDocumentsChanged(['files', 'backlinks', 'graph']);
      } catch (reconcileErr) {
        reconcileOk = false;
        console.warn('[EditorTabs] post-rename reconciliation failed', {
          err: reconcileErr,
          docName,
          newDocName,
          normalized,
        });
        toast.error(t`Rename succeeded but the tabstrip may be out of date — refresh to resync`);
      }
      cancelRequestedRef.current = true;
      setRenamingTab(null);
      setRenameValue('');
      setRenameError(null);
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = null;
      if (reconcileOk && nextActiveDocName && nextActiveDocName !== currentActiveDocName) {
        navigateToDoc(nextActiveDocName);
      }
    } catch (err) {
      console.warn('[EditorTabs] rename failed', { err, docName, newDocName, normalized });
      setRenameError(t`Network error — please try again`);
      setIsRenameLoading(false);
      commitInProgressRef.current = false;
      lastFailedValueRef.current = normalized;
      renameInputRef.current?.focus();
    }
  }

  return {
    cancelRename,
    commitRename,
    enterRenameMode,
    isRenameLoading,
    renameError,
    renameInputRef,
    renameValue,
    renamingTab,
    setRenameError,
    updateRenameValue,
  };
}
