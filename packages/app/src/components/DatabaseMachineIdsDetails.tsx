import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DatabaseMachineIdEntry {
  kind: string;
  label: ReactNode;
  value: string | null | undefined;
}

/**
 * Progressive disclosure for stable database identifiers.
 *
 * Human-facing database surfaces should lead with names and intent. The
 * identifiers remain available to agents, support, and automation in a
 * native <details> element and in the surrounding data-* attributes owned by
 * the canonical surface.
 */
export function DatabaseMachineIdsDetails({
  entries,
  className,
  testId = 'database-machine-ids',
}: {
  entries: readonly DatabaseMachineIdEntry[];
  className?: string;
  testId?: string;
}): React.JSX.Element | null {
  const present = entries.filter((entry) => entry.value);
  if (present.length === 0) return null;

  return (
    <details
      className={cn('rounded-md border bg-muted/20 text-xs', className)}
      data-testid={testId}
      data-database-machine-ids="stable"
    >
      <summary className="cursor-pointer px-3 py-2 font-medium">Advanced machine IDs</summary>
      <div className="border-t px-3 py-2">
        <p className="text-muted-foreground">
          Stable identifiers are kept here for agents and automation. Names and labels remain the
          primary interface.
        </p>
        <dl className="mt-2 grid gap-1 font-mono text-[11px]">
          {present.map((entry) => (
            <div
              key={`${entry.kind}:${entry.value}`}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"
              data-machine-id-kind={entry.kind}
            >
              <dt className="text-muted-foreground">{entry.label}</dt>
              <dd className="break-all text-right" data-machine-id-value={entry.value ?? undefined}>
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
