import { useEffect, useRef, useCallback } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { useFileContent } from '../../shared/hooks/useFileContent';
import { wikilinkPlugin } from '../../shared/plugins/wikilinkPlugin';
import { BacklinksPanel } from './BacklinksPanel';

export function EditorView({ path, onUnauthorized, onNavigate, onClose }) {
  const {
    content,
    loading,
    error,
    saving,
    debouncedSave,
    flush,
  } = useFileContent(path, { onUnauthorized });
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const initRef = useRef(false);

  const searchLinks = useCallback(async (query) => {
    const endpoint = query
      ? `/api/nodes?q=${encodeURIComponent(query)}`
      : '/api/nodes';
    const res = await fetch(endpoint, { credentials: 'include' });
    if (res.status === 401) {
      onUnauthorized?.();
      return [];
    }
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? [])
      .filter((item) => item.type === 'Document')
      .slice(0, 8);
  }, [onUnauthorized]);

  const handleNavigate = useCallback(async (target, options) => {
    await flush();
    onNavigate?.(target, options);
  }, [flush, onNavigate]);

  const handleClose = useCallback(async () => {
    await flush();
    onClose?.();
  }, [flush, onClose]);

  useEffect(() => {
    if (loading || !containerRef.current) return;
    if (initRef.current) return;
    initRef.current = true;

    const el = containerRef.current;

    Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, el);
        ctx.set(defaultValueCtx, content);
        ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
          debouncedSave(md);
        });
      })
      .use(commonmark)
      .use(history)
      .use(listener)
      .use(wikilinkPlugin({ onNavigate: handleNavigate, onSearch: searchLinks }))
      .create()
      .then(editor => { editorRef.current = editor; });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
      initRef.current = false;
    };
  }, [loading, content, debouncedSave, handleNavigate, searchLinks]);

  if (loading) {
    return (
      <div className="editor-view" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="editor-view" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span className="icon" style={{ fontSize: 28, color: 'var(--error)', opacity: 0.5 }}>error_outline</span>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="editor-view">
      <div className="editor-toolbar">
        <button className="editor-toolbar-btn" title="뒤로" onClick={() => { void handleClose(); }}>
          <span className="icon">arrow_back</span>
        </button>
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--on-variant)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {path?.split('/').pop()?.replace(/\.md$/, '') ?? ''}
        </span>
        <span className="editor-save-indicator">
          {saving ? 'Saving...' : 'Saved'}
        </span>
      </div>
      <div className="editor-body">
        <div className="editor-container" ref={containerRef} />
        <BacklinksPanel
          path={path}
          onUnauthorized={onUnauthorized}
          onNavigate={handleNavigate}
        />
      </div>
    </div>
  );
}
