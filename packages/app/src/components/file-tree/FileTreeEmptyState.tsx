import { Trans, useLingui } from '@lingui/react/macro';
import type { DragEvent } from 'react';
import { FileTreeFilteredToZeroNotice } from '@/components/FileTreeFilteredToZeroNotice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  reconnectNotice: string | null;
  error: string | null;
  filteredToZero: boolean;
  externalDropActive: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onCreateFirstFile: () => void;
};

/** Renders the mutually-exclusive empty, filtering, error, reconnect, and first-file states. */
export function FileTreeEmptyState({
  reconnectNotice,
  error,
  filteredToZero,
  externalDropActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onCreateFirstFile,
}: Props) {
  const { t } = useLingui();
  if (reconnectNotice !== null) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <span role="status" className="select-none text-sidebar-foreground/50 text-sm">
          {reconnectNotice}
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <span role="alert" className="select-none text-sidebar-foreground/50 text-sm">
          {error}
        </span>
      </div>
    );
  }
  if (filteredToZero) return <FileTreeFilteredToZeroNotice />;
  return (
    <section
      aria-label={t`File drop zone`}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3 rounded-md py-8',
        externalDropActive && 'bg-primary/5 ring-2 ring-primary/70 ring-inset',
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className="select-none text-sidebar-foreground/30 text-sm">
        <Trans>No files yet.</Trans>
      </span>
      <Button variant="link" size="sm" className="font-mono uppercase" onClick={onCreateFirstFile}>
        <Trans>Create your first file</Trans>
      </Button>
    </section>
  );
}
