import { Trans } from '@lingui/react/macro';
import { DatabaseWorkspaceRecordActions } from './DatabaseWorkspaceRecordActions';
import { DatabaseWorkspaceStatusPanel } from './DatabaseWorkspaceStatusPanel';
import { DatabaseWorkspaceToolbar } from './DatabaseWorkspaceToolbar';
import { DatabaseWorkspaceViewRenderer } from './DatabaseWorkspaceViewRenderer';
import {
  isDatabaseWorkspaceResultContext,
  isDatabaseWorkspaceSuccessContext,
  type DatabaseWorkspaceRenderContext,
} from './database-workspace-context';

export function DatabaseWorkspaceSuccessContent({
  context,
}: {
  context: DatabaseWorkspaceRenderContext;
}) {
  if (!isDatabaseWorkspaceSuccessContext(context)) return null;
  const { result, offlineCachedAt } = context;
  return (
    <div className="space-y-3">
      {offlineCachedAt !== null && result ? (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
              role="status"
              data-database-state="offline-cache"
            >
              <div className="font-medium">
                <Trans>Read-only cached database</Trans>
              </div>
              <p className="text-muted-foreground text-xs">
                <Trans>
                  Cached {new Date(offlineCachedAt).toLocaleString()} · snapshot{' '}
                  {result.snapshotRevision} · index {result.indexFreshness}. Relations and derived
                  values are only as current as this snapshot.
                </Trans>
              </p>
            </div>
      ) : null}
      <DatabaseWorkspaceToolbar context={context} />
      {isDatabaseWorkspaceResultContext(context) ? (
        <DatabaseWorkspaceRecordActions context={context} />
      ) : null}
      <DatabaseWorkspaceStatusPanel context={context} />
      <DatabaseWorkspaceViewRenderer context={context} />
    </div>
  );
}
