import { Trans } from '@lingui/react/macro';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { databasePropertyTypeLabel } from '@/lib/database-property-copy';
import type { DatabasePropertyDeletionPreview } from '@/lib/database-property-deletion';

export function DatabasePropertyDeletionPreviewDialog({
  open,
  onOpenChange,
  preview,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: DatabasePropertyDeletionPreview;
  busy?: boolean;
  onConfirm: () => void;
}) {
  'use no memo';
  const title = preview.property.type === 'title';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
            <Trans>Review property deletion</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              This removes the property from the schema and clears its values from canonical
              records. Review the impact before opening the exact commit plan.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
            <strong>{preview.property.name}</strong>
            <Badge variant="outline">{databasePropertyTypeLabel(preview.property.type)}</Badge>
            {title ? <Badge variant="gray">Frozen</Badge> : null}
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md border p-2">
              <dt className="text-muted-foreground text-xs">
                <Trans>Values to clear</Trans>
              </dt>
              <dd className="font-semibold text-lg">{preview.valueCount}</dd>
            </div>
            <div className="rounded-md border p-2">
              <dt className="text-muted-foreground text-xs">
                <Trans>Records checked</Trans>
              </dt>
              <dd className="font-semibold text-lg">{preview.recordCount}</dd>
            </div>
            <div className="rounded-md border p-2">
              <dt className="text-muted-foreground text-xs">
                <Trans>Dependencies</Trans>
              </dt>
              <dd className="font-semibold text-lg">{preview.dependencies.length}</dd>
            </div>
          </dl>
          {preview.dependencies.length > 0 ? (
            <section
              className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
              aria-label="Property deletion dependencies"
            >
              <h3 className="font-medium text-sm">
                <Trans>Objects that may need attention</Trans>
              </h3>
              <ul className="space-y-1 text-sm">
                {preview.dependencies.map((dependency) => (
                  <li key={`${dependency.kind}:${dependency.id}`}>
                    <span className="font-medium">{dependency.name}</span>{' '}
                    <span className="text-muted-foreground">— {dependency.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
              <Trans>No dependent properties or saved views were found.</Trans>
            </p>
          )}
          <p className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-muted-foreground text-sm">
            <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <Trans>
                The app clears values first, then removes the schema in reviewed steps. After a
                successful commit, History exposes Undo for recovery.
              </Trans>
            </span>
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button type="button" variant="destructive" disabled={busy || title} onClick={onConfirm}>
            <Trans>Continue to review</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
