import { Trans } from '@lingui/react/macro';
import type { DatabaseView } from '@nedian0brien/synapsenote-core';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function DatabaseViewRenameDialog({
  open,
  onOpenChange,
  view,
  busy,
  onReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: DatabaseView | null;
  busy: boolean;
  onReview: (name: string) => void;
}) {
  const [name, setName] = useState(view?.name ?? '');

  useEffect(() => {
    if (open) setName(view?.name ?? '');
  }, [open, view]);

  if (!view) return null;
  const trimmedName = name.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Rename saved view</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Keep the stable view identity and review the new display name.</Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Input
            value={name}
            maxLength={200}
            autoFocus
            aria-label="Saved view name"
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && trimmedName && trimmedName !== view.name && !busy) {
                onReview(trimmedName);
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type="button"
              disabled={busy || !trimmedName || trimmedName === view.name}
              onClick={() => onReview(trimmedName)}
            >
              <Trans>Review rename</Trans>
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
