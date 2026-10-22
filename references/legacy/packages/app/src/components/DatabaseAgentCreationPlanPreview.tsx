import { Trans } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import {
  createAgentDatabasePlanPreview,
  type DatabaseAgentCreationPlanPreview as DatabaseAgentCreationPlan,
} from '@/lib/database-creation';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const EDITABLE_PROPERTY_TYPES = ['text', 'number', 'checkbox', 'date', 'select'] as const;
const EDITABLE_VIEW_LAYOUTS = ['table', 'board'] as const;

type EditableProperty = DatabaseAgentCreationPlan['properties'][number];
type EditableView = DatabaseAgentCreationPlan['views'][number];

export interface DatabaseAgentCreationPlanOverrides {
  properties: readonly EditableProperty[];
  views: readonly EditableView[];
  includeSamples: boolean;
}

function previewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function draftFromPlan(plan: DatabaseAgentCreationPlan): DatabaseAgentCreationPlanOverrides {
  return {
    properties: plan.properties.map((property) => ({ ...property })),
    views: plan.views.map((view) => ({ ...view })),
    includeSamples: true,
  };
}

/**
 * A non-persistent, conservative preview for the Assistant creation branch.
 * The installed agent still owns the actual proposal and exact-plan handoff;
 * this surface makes the likely shape visible while the user is composing.
 */
export function DatabaseAgentCreationPlanPreview({
  goal,
  onPlanChange,
}: {
  goal: string;
  onPlanChange?: (overrides: DatabaseAgentCreationPlanOverrides | null) => void;
}) {
  const plan = createAgentDatabasePlanPreview(goal);
  const [draft, setDraft] = useState<DatabaseAgentCreationPlanOverrides | null>(null);

  useEffect(() => {
    const nextPlan = createAgentDatabasePlanPreview(goal);
    setDraft(nextPlan ? draftFromPlan(nextPlan) : null);
    onPlanChange?.(null);
  }, [goal, onPlanChange]);

  if (!plan) return null;

  const current = draft ?? draftFromPlan(plan);
  const updateDraft = (
    update: (current: DatabaseAgentCreationPlanOverrides) => DatabaseAgentCreationPlanOverrides,
  ) => {
    setDraft((previous) => {
      const next = update(previous ?? draftFromPlan(plan));
      onPlanChange?.(next);
      return next;
    });
  };

  return (
    <section
      className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3"
      aria-label="Agent database plan preview"
      data-testid="database-agent-plan-preview"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">Agent proposal · not saved</Badge>
        <span className="text-muted-foreground text-xs">
          <Trans>Review and edit this shape before the agent prepares the exact plan.</Trans>
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
            <Trans>Edit properties</Trans>
          </h4>
          <ul className="mt-2 grid gap-2 text-xs">
            {current.properties.map((property) => (
              <li key={property.key} className="grid gap-1">
                <Input
                  value={property.name}
                  aria-label={`Property name ${property.key}`}
                  className="h-8 text-xs"
                  onChange={(event) =>
                    updateDraft((next) => ({
                      ...next,
                      properties: next.properties.map((candidate) =>
                        candidate.key === property.key
                          ? { ...candidate, name: event.target.value }
                          : candidate,
                      ),
                    }))
                  }
                />
                <Select
                  value={property.type}
                  onValueChange={(value) =>
                    updateDraft((next) => ({
                      ...next,
                      properties: next.properties.map((candidate) =>
                        candidate.key === property.key ? { ...candidate, type: value } : candidate,
                      ),
                    }))
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`Property type ${property.key}`}
                    className="h-8 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(property.key === 'title' ? ['title'] : EDITABLE_PROPERTY_TYPES).map(
                      (type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded border bg-background p-2">
          <h4 className="font-medium text-xs">
            <Trans>Edit views</Trans>
          </h4>
          <ul className="mt-2 grid gap-2 text-xs">
            {current.views.map((view) => (
              <li key={view.key} className="grid gap-1">
                <Input
                  value={view.name}
                  aria-label={`View name ${view.key}`}
                  className="h-8 text-xs"
                  onChange={(event) =>
                    updateDraft((next) => ({
                      ...next,
                      views: next.views.map((candidate) =>
                        candidate.key === view.key
                          ? { ...candidate, name: event.target.value }
                          : candidate,
                      ),
                    }))
                  }
                />
                <Select
                  value={view.layout}
                  onValueChange={(value) =>
                    updateDraft((next) => ({
                      ...next,
                      views: next.views.map((candidate) =>
                        candidate.key === view.key ? { ...candidate, layout: value } : candidate,
                      ),
                    }))
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`View layout ${view.key}`}
                    className="h-8 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDITABLE_VIEW_LAYOUTS.map((layout) => (
                      <SelectItem key={layout} value={layout}>
                        {layout}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded border bg-background p-2">
        <label className="flex items-center gap-2 text-xs" htmlFor="database-agent-plan-samples">
          <Checkbox
            id="database-agent-plan-samples"
            checked={current.includeSamples}
            onCheckedChange={(checked) =>
              updateDraft((next) => ({ ...next, includeSamples: checked === true }))
            }
            aria-label="Include sample pages"
          />
          <span className="font-medium">
            <Trans>Include optional sample pages in the proposal</Trans>
          </span>
        </label>
        {current.includeSamples ? (
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
