import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AuthModal } from '@/components/AuthModal';
import { EnableSyncConfirmDialog } from '@/components/EnableSyncConfirmDialog';
import { PublishToGitHubDialog } from '@/components/PublishToGitHubDialog';
import {
  formatPausedReason,
  shouldDisableSyncSwitch,
  shouldOfferSignInAgain,
} from '@/components/SyncStatusBadge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  useEnableSyncWithConfirm,
  useSyncDefaultWriter,
  useSyncEnabledWriter,
} from '@/hooks/use-enable-sync-with-confirm';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { useConfigContext } from '@/lib/config-provider';
import { COMMITTED_DEFAULT_SELECTED_CLASS } from '../SettingsSchemaRegistry';

export function SyncSection() {
  const { t } = useLingui();
  const status = useGitSyncStatus();
  const { projectConfig, projectLocalConfig, projectLocalSynced, projectSynced } =
    useConfigContext();
  const writer = useSyncEnabledWriter();
  const defaultWriter = useSyncDefaultWriter();
  const { confirmOpen, setConfirmOpen, onToggleRequest, onConfirm } =
    useEnableSyncWithConfirm(writer);
  const [publishOpen, setPublishOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const enabled = projectLocalConfig?.autoSync?.enabled ?? false;
  const disabledControl = shouldDisableSyncSwitch(
    projectLocalSynced,
    status?.pushPermission?.checkStatus,
  );
  const isPushDenied =
    status?.pushPermission?.checkStatus === 'denied' ||
    status?.pausedReason === 'no-push-permission';
  const sectionMessage =
    isPushDenied || !status?.pausedReason ? null : formatPausedReason(status.pausedReason);
  const committedDefault = projectConfig?.autoSync?.default ?? null;
  const committedDefaultValue =
    committedDefault === true ? 'on' : committedDefault === false ? 'off' : 'ask';
  const onCommittedDefaultChange = (next: string) => {
    if (next !== 'ask' && next !== 'on' && next !== 'off') return;
    if (defaultWriter === null) {
      toast.error(t`Sync settings not yet loaded — try again in a moment`);
      return;
    }
    const result = defaultWriter(next === 'on' ? true : next === 'off' ? false : null);
    if (!result.ok) toast.error(t`Failed to update the project sync default — ${result.error}`);
  };
  if (status && !status.hasRemote && status.state === 'dormant') {
    return (
      <section
        aria-labelledby="settings-sync-title"
        className="space-y-4"
        data-testid="settings-sync-empty"
      >
        <div className="space-y-1">
          <h3 id="settings-sync-title" className="text-base font-semibold">
            <Trans>Sync</Trans>
          </h3>
          <p className="text-sm text-muted-foreground">
            <Trans>
              This project lives only on this computer. Connect it to GitHub to back it up and share
              it with other people.
            </Trans>
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">
              <Trans>Connect to GitHub</Trans>
            </div>
            <p className="text-muted-foreground text-1sm">
              <Trans>We'll create a repository and start syncing — no terminal needed.</Trans>
            </p>
          </div>
          <Button onClick={() => setPublishOpen(true)} data-testid="settings-sync-setup">
            <Trans>Set up syncing</Trans>
          </Button>
        </div>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group gap-1 px-1.5 text-muted-foreground">
              <ChevronRight
                className="size-3.5 transition-transform group-data-[state=open]:rotate-90"
                aria-hidden
              />
              <Trans>Connect an existing repository</Trans>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-1.5 pt-2 text-sm text-muted-foreground">
            <Trans>
              Already have a git repository? Add it with{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                git remote add origin &lt;url&gt;
              </code>{' '}
              in this project's folder. This page updates automatically once a remote is detected.
            </Trans>
          </CollapsibleContent>
        </Collapsible>
        <PublishToGitHubDialog open={publishOpen} onOpenChange={setPublishOpen} />
      </section>
    );
  }
  return (
    <section aria-labelledby="settings-sync-title" className="space-y-3">
      <div className="space-y-1">
        <h3 id="settings-sync-title" className="text-base font-semibold">
          <Trans>Sync</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Auto-sync pushes/pulls commits to your git remote on intervals and on save. Toggling on
            requires confirmation.
          </Trans>
        </p>
      </div>
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor="settings-sync-toggle" className="text-sm font-medium">
              <Trans>Git auto-sync</Trans>
            </label>
            <p className="text-muted-foreground text-1sm" data-testid="settings-sync-body">
              {isPushDenied ? (
                <Trans>Auto-sync is off — you don't have permission to push to this repo</Trans>
              ) : enabled ? (
                <Trans>
                  Auto-sync is on — your commits push and remote changes pull on intervals.
                </Trans>
              ) : (
                <Trans>
                  Auto-sync is off — your edits stay local until you commit and push manually.
                </Trans>
              )}
            </p>
            {status?.remote ? (
              <p
                className="text-muted-foreground text-1sm truncate"
                data-testid="settings-sync-remote"
              >
                <Trans>Connected to</Trans>{' '}
                {status.remote.webUrl ? (
                  <a
                    href={status.remote.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:text-primary hover:underline inline-flex items-center gap-0.5"
                    aria-label={t`Open ${status.remote.label} on GitHub (opens in a new tab)`}
                    data-testid="settings-sync-remote-link"
                  >
                    <span>{status.remote.label}</span>
                    <ArrowUpRight className="inline size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span
                    className="font-medium text-foreground"
                    data-testid="settings-sync-remote-label"
                  >
                    {status.remote.label}
                  </span>
                )}
              </p>
            ) : null}
          </div>
          <Switch
            id="settings-sync-toggle"
            checked={enabled}
            disabled={disabledControl}
            onCheckedChange={onToggleRequest}
            aria-label={
              status?.pushPermission?.checkStatus === 'denied'
                ? t`Sync disabled — you don't have permission to push`
                : enabled
                  ? t`Disable git auto-sync`
                  : t`Enable git auto-sync`
            }
            data-testid="settings-sync-toggle"
          />
        </div>
        {sectionMessage !== null ? (
          <p className="text-1sm text-muted-foreground mt-2" data-testid="settings-sync-reason">
            {sectionMessage}
          </p>
        ) : null}
        {shouldOfferSignInAgain(status?.pushPermission) ? (
          <div className="mt-2 flex items-start gap-2" data-testid="settings-sync-signin-again">
            <p className="text-1sm text-muted-foreground flex-1 min-w-0">
              <Trans>Your GitHub session expired — sign in again to verify push access.</Trans>
            </p>
            <Button
              variant="outline"
              size="xs"
              className="self-start"
              onClick={() => setAuthModalOpen(true)}
            >
              <Trans>Sign in</Trans>
            </Button>
          </div>
        ) : null}
      </div>
      <div className="rounded-md border p-3 space-y-2" data-testid="settings-sync-default">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">
            <Trans>Shared default</Trans>
          </div>
          <p className="text-muted-foreground text-1sm">
            <Trans>
              Set the auto-sync default for users opening this project for the first time. This
              setting is committed to your repository.
            </Trans>
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={committedDefaultValue}
          onValueChange={onCommittedDefaultChange}
          disabled={!projectSynced}
          aria-label={t`Shared auto-sync default`}
          data-testid="settings-sync-default-toggle"
        >
          <ToggleGroupItem
            value="ask"
            className={COMMITTED_DEFAULT_SELECTED_CLASS}
            data-testid="settings-sync-default-ask"
          >
            <Trans>None</Trans>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="on"
            className={COMMITTED_DEFAULT_SELECTED_CLASS}
            data-testid="settings-sync-default-on"
          >
            <Trans>On</Trans>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="off"
            className={COMMITTED_DEFAULT_SELECTED_CLASS}
            data-testid="settings-sync-default-off"
          >
            <Trans>Off</Trans>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <EnableSyncConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={onConfirm}
      />
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onSuccess={() => setAuthModalOpen(false)}
      />
    </section>
  );
}
