import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { createAgentDatabasePlanPreview } from '@/lib/database-creation';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';

function previewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A non-persistent, conservative preview for the Assistant creation branch.
 * The installed agent still owns the actual proposal and exact-plan handoff;
 * this surface makes the likely shape visible while the user is composing.
 */
export function DatabaseAgentCreationPlanPreview({ goal }: { goal: string }) {
  const plan = createAgentDatabasePlanPreview(goal);
  const [includeSamples, setIncludeSamples] = useState(true);
  if (!plan) return null;

  return (
    <section
      className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3"
      aria-label="Agent database plan preview"
      data-testid="database-agent-plan-preview"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">Agent proposal · not saved</Badge>
        <span className="text-muted-foreground text-xs">
          <Trans>Review this shape before the agent prepares the exact plan.</Trans>
        </span>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted-foreground">
          <Trans>Goal</Trans>
        </dt>
        <dd className="break-words">{plan.goal}</dd>
        <dt className="text-muted-foreground">
          <Trans>Suggested name</Trans>
        </dt>
        <dd>{plan.name}</dd>
        <dt className="text-muted-foreground">
          <Trans>Starter template</Trans>
        </dt>
        <dd>{plan.templateName}</dd>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border bg-background p-2">
          <h4 className="font-medium text-xs">
            <Trans>Properties</Trans>
          </h4>
          <ul className="mt-2 grid gap-1 text-xs">
            {plan.properties.map((property) => (
              <li key={`${property.name}:${property.type}`} className="flex justify-between gap-2">
                <span>{property.name}</span>
                <span className="text-muted-foreground">{property.type}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded border bg-background p-2">
          <h4 className="font-medium text-xs">
            <Trans>Views</Trans>
          </h4>
          <ul className="mt-2 grid gap-1 text-xs">
            {plan.views.map((view) => (
              <li key={`${view.name}:${view.layout}`} className="flex justify-between gap-2">
                <span>{view.name}</span>
                <span className="text-muted-foreground">{view.layout}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded border bg-background p-2">
        <label className="flex items-center gap-2 text-xs" htmlFor="database-agent-plan-samples">
          <Checkbox
            id="database-agent-plan-samples"
            checked={includeSamples}
            onCheckedChange={(checked) => setIncludeSamples(checked === true)}
            aria-label="Include sample pages"
          />
          <span className="font-medium">
            <Trans>Include optional sample pages in the proposal</Trans>
          </span>
        </label>
        {includeSamples ? (
          <ul className="mt-2 grid gap-1 text-xs" data-testid="database-agent-plan-samples">
            {plan.sampleRecords.slice(0, 3).map((record) => (
              <li key={JSON.stringify(record)} className="rounded border bg-muted/20 px-2 py-1">
                {Object.entries(record)
                  .slice(0, 4)
                  .map(([key, value]) => `${key}: ${previewValue(value)}`)
                  .join(' · ')}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted-foreground text-xs">
            <Trans>No sample pages will be included in the proposal.</Trans>
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        <Trans>
          Nothing is saved from this preview. The agent must still produce a reviewed plan before
          any database or sample page is created.
        </Trans>
      </p>
    </section>
  );
}
