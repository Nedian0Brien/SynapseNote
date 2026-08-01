import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatabaseSavedViewSettingsCommonPanel } from './DatabaseSavedViewSettingsCommonPanel';
import { DatabaseSavedViewSettingsConditionalColorsPanel } from './DatabaseSavedViewSettingsConditionalColorsPanel';
import { DatabaseSavedViewSettingsLayoutPanel } from './DatabaseSavedViewSettingsLayoutPanel';
import { DatabaseSavedViewSettingsProjectionPanel } from './DatabaseSavedViewSettingsProjectionPanel';
import { DatabaseSavedViewSettingsSortsGroupsPanel } from './DatabaseSavedViewSettingsSortsGroupsPanel';
import type { DatabaseSavedViewSettingsDialogProps } from './database-saved-view-settings-types';
import { useSavedViewSettingsDraft } from './use-saved-view-settings-draft';

/** Composes focused settings panels into the stable public saved-view dialog. */
export function DatabaseSavedViewSettingsDialog({
  database,
  initialSortPropertyId,
  onOpenChange,
  onSave,
  open,
  source,
  view,
}: DatabaseSavedViewSettingsDialogProps) {
  'use no memo';
  const { compile, draft, reset, setDraft } = useSavedViewSettingsDraft({
    initialSortPropertyId,
    open,
    source,
    view,
  });
  const [error, setError] = useState<string | null>(null);
  const panelProps = { database, draft, setDraft, source, view };
  const save = () => {
    try {
      onSave(compile());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saved view settings are invalid');
    }
  };
  const close = () => {
    reset();
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Saved view settings</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Persist query order, grouping, projection, and display settings in one reviewed view
              revision.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <DatabaseSavedViewSettingsCommonPanel
            openBehavior={draft.openBehavior}
            onOpenBehaviorChange={(openBehavior) =>
              setDraft((current) => ({ ...current, openBehavior }))
            }
          />
          <DatabaseSavedViewSettingsSortsGroupsPanel {...panelProps} />
          <DatabaseSavedViewSettingsProjectionPanel {...panelProps} />
          <DatabaseSavedViewSettingsConditionalColorsPanel {...panelProps} />
          <DatabaseSavedViewSettingsLayoutPanel {...panelProps} />
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={save}>
              <Trans>Review view settings</Trans>
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
