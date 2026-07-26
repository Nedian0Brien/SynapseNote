import type { HocuspocusProvider } from '@hocuspocus/provider';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProviderPool } from '@/editor/provider-pool';
import { createStandaloneTiptapEditor } from '@/editor/TiptapEditor';
import { tabSessionId } from '@/editor/tab-identity';
import { cn } from '@/lib/utils';

type EditorStatus = 'connecting' | 'ready' | 'error' | 'unavailable';

export function DatabaseRecordPeekEditor({
  docName,
  initialBody,
  collabUrl,
  principalId,
}: {
  docName: string;
  initialBody: string;
  collabUrl: string | null;
  principalId: string | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<EditorStatus>(() =>
    collabUrl ? 'connecting' : 'unavailable',
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !collabUrl) {
      setStatus('unavailable');
      return;
    }

    setStatus('connecting');
    const pool = new ProviderPool(1, collabUrl, { storage: null });
    if (principalId) pool.setTabIdentity({ principalId, tabSessionId });
    const entry = pool.open(docName);
    if (!entry) {
      setStatus('error');
      pool.dispose();
      return;
    }

    const provider: HocuspocusProvider = entry.provider;
    const onSynced = () => setStatus('ready');
    const onAuthenticationFailed = () => setStatus('error');
    provider.on('synced', onSynced);
    provider.on('authenticationFailed', onAuthenticationFailed);

    let editor: ReturnType<typeof createStandaloneTiptapEditor> | null = null;
    try {
      editor = createStandaloneTiptapEditor({
        element: host,
        provider,
        placeholder: t`Press Enter to start writing on this page.`,
        onWedged: () => setStatus('error'),
      });
    } catch (error) {
      console.error('[DatabaseRecordPeekEditor] editor mount failed', error);
      setStatus('error');
    }

    return () => {
      provider.off('synced', onSynced);
      provider.off('authenticationFailed', onAuthenticationFailed);
      editor?.destroy();
      pool.dispose();
    };
  }, [collabUrl, docName, principalId]);

  const showFallback = status !== 'ready';
  return (
    <div
      className="relative min-h-24"
      data-database-peek-editor
      data-editor-status={status}
      data-record-body
    >
      <div
        ref={hostRef}
        className={cn(
          'database-peek-editor-surface min-h-24 text-[0.95rem] leading-7',
          showFallback && 'pointer-events-none absolute inset-0 opacity-0',
        )}
        aria-hidden={showFallback || undefined}
      />
      {showFallback ? (
        <div className="min-h-24 py-4 text-[0.95rem] leading-7">
          {initialBody ? (
            <div className="whitespace-pre-wrap break-words">{initialBody}</div>
          ) : (
            <p className="text-muted-foreground">
              <Trans>Press Enter to start writing on this page.</Trans>
            </p>
          )}
          {status === 'connecting' ? (
            <span className="mt-3 inline-flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" /> <Trans>Connecting editor</Trans>
            </span>
          ) : null}
          {status === 'error' ? (
            <p className="mt-3 text-destructive text-xs" role="alert">
              <Trans>The inline editor could not connect. Reopen the page to retry.</Trans>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
