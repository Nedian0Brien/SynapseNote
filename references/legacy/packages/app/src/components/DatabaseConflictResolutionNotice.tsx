import { Trans } from '@lingui/react/macro';
import type { DatabasePlanArtifact } from '@nedian0brien/synapsenote-server';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { databaseConflictSections } from '@/lib/database-conflict-resolution';

export function DatabaseConflictResolutionNotice({
  plan,
  onUseLatest,
  onReplan,
}: {
  plan: DatabasePlanArtifact;
  onUseLatest: () => void;
  onReplan?: () => void;
}) {
  const sections = databaseConflictSections(plan);
  return (
    <div
      className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
      role="alert"
      data-database-conflict-resolution
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <div className="font-medium">
            <Trans>Resolve concurrent database changes</Trans>
          </div>
          <p className="text-muted-foreground">
            <Trans>
              Nothing was overwritten. Choose the latest state, or create and review a fresh exact
              plan.
            </Trans>
          </p>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.domain} className="rounded border bg-background/70 p-2">
            <div className="font-medium">{section.title}</div>
            <p className="text-muted-foreground">{section.guidance}</p>
            {section.conflicts.length > 0 ? (
              <ul className="mt-1 list-disc pl-4 text-destructive">
                {section.conflicts.map((conflict) => (
                  <li key={`${conflict.code}-${conflict.targetId}-${conflict.message}`}>
                    {conflict.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {!plan.committable ? (
        <p className="text-muted-foreground">
          <Trans>Edit the affected settings or values, then submit the change again.</Trans>
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onUseLatest}>
          <Trans>Use latest state</Trans>
        </Button>
        {onReplan ? (
          <Button type="button" size="sm" onClick={onReplan}>
            <Trans>Replan my change</Trans>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
