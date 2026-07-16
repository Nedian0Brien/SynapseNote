import { Trans } from '@lingui/react/macro';
import { ArrowRightLeft, Eye, GitCommitVertical } from 'lucide-react';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function AutoSyncEnableDialogIntro() {
  return (
    <>
      <DialogTitle>
        <Trans>Enable git auto-sync?</Trans>
      </DialogTitle>
      <DialogDescription>
        <Trans>
          Auto-sync periodically fetches, pulls, and pushes commits to your remote git repository so
          your edits stay in sync across machines.
        </Trans>
      </DialogDescription>
    </>
  );
}

export function AutoSyncEnableWarning() {
  return (
    <div role="note" className="text-sm space-y-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold font-mono uppercase tracking-wider text-primary">
        <span aria-hidden="true" className="mb-[3px] flex items-center justify-center">
          ◇
        </span>
        <Trans>Heads up</Trans>
      </p>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <ArrowRightLeft
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="space-y-0.5">
            <p className="font-medium">
              <Trans>Uncommitted changes</Trans>
            </p>
            <p className="text-muted-foreground">
              <Trans>Pulls may overwrite uncommitted edits in your local files.</Trans>
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <GitCommitVertical
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="space-y-0.5">
            <p className="font-medium">
              <Trans>Commits happen automatically</Trans>
            </p>
            <p className="text-muted-foreground">
              <Trans>
                SynapseNote will create commits and push them to your remote automatically. If you
                do not want automatic commits in your git history, you should not enable auto-sync.
              </Trans>
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5">
            <p className="font-medium">
              <Trans>Shared repositories</Trans>
            </p>
            <p className="text-muted-foreground">
              <Trans>Collaborators see your in-progress edits as soon as they sync.</Trans>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
