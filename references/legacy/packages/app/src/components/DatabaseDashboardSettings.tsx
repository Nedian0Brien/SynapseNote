import { Trans } from '@lingui/react/macro';
import type {
  DatabaseDashboardViewConfiguration,
  DatabaseDefinition,
  DatabaseFilter,
} from '@nedian0brien/synapsenote-core';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function id(prefix: 'dshr' | 'dshw' | 'dshf'): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').toLowerCase()}`;
}

function move<T>(values: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= values.length) return [...values];
  const next = [...values];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

export function DatabaseDashboardSettings({
  database,
  dashboardViewId,
  value,
  onChange,
}: {
  database: Pick<DatabaseDefinition, 'views' | 'sources'>;
  dashboardViewId: string;
  value: DatabaseDashboardViewConfiguration;
  onChange: (value: DatabaseDashboardViewConfiguration) => void;
}) {
  const eligibleViews = database.views.filter(
    (view) =>
      view.id !== dashboardViewId && !['dashboard', 'form', 'agent'].includes(view.layout.type),
  );
  const defaultWidgetView = eligibleViews[0];
  const widgetCount = value.rows.reduce((sum, row) => sum + row.widgets.length, 0);
  const widgetEntries = value.rows.flatMap((row) => row.widgets);
  const interactionCandidates = widgetEntries.flatMap((sourceWidget) => {
    const sourceView = database.views.find((view) => view.id === sourceWidget.viewId);
    if (!sourceView) return [];
    return widgetEntries.flatMap((targetWidget) => {
      if (targetWidget.id === sourceWidget.id) return [];
      const targetView = database.views.find((view) => view.id === targetWidget.viewId);
      const targetSource = database.sources.find((source) => source.id === targetView?.sourceId);
      return (targetSource?.properties ?? []).flatMap((property) =>
        property.type === 'relation' && property.targetSourceId === sourceView.sourceId
          ? [{ sourceWidget, targetWidget, property }]
          : [],
      );
    });
  });

  return (
    <section className="space-y-4" aria-label="Saved Dashboard settings">
      <div className="flex items-center justify-between gap-2">
        <div>
          <strong>
            <Trans>Dashboard layout</Trans>
          </strong>
          <p className="text-muted-foreground text-xs">
            Up to four widgets per row and twelve widgets total. Rows stack on narrow screens.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={value.rows.length >= 12 || widgetCount >= 12 || eligibleViews.length === 0}
          onClick={() =>
            defaultWidgetView &&
            onChange({
              ...value,
              rows: [
                ...value.rows,
                {
                  id: id('dshr'),
                  height: 'medium',
                  widgets: [{ id: id('dshw'), viewId: defaultWidgetView.id, width: 4 }],
                },
              ],
            })
          }
        >
          <Plus /> Add row
        </Button>
      </div>
      {value.rows.map((row, rowIndex) => {
        const usedWidth = row.widgets.reduce((sum, widget) => sum + widget.width, 0);
        return (
          <div
            key={row.id}
            className="space-y-2 rounded border p-3"
            data-dashboard-settings-row={row.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-sm">Row {rowIndex + 1}</span>
              <div className="flex items-center gap-1">
                <Select
                  value={row.height}
                  onValueChange={(height) =>
                    onChange({
                      ...value,
                      rows: value.rows.map((candidate) =>
                        candidate.id === row.id
                          ? { ...candidate, height: height as typeof row.height }
                          : candidate,
                      ),
                    })
                  }
                >
                  <SelectTrigger size="sm" aria-label={`Height for row ${rowIndex + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move row ${rowIndex + 1} up`}
                  disabled={rowIndex === 0}
                  onClick={() => onChange({ ...value, rows: move(value.rows, rowIndex, -1) })}
                >
                  <ArrowLeft />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move row ${rowIndex + 1} down`}
                  disabled={rowIndex === value.rows.length - 1}
                  onClick={() => onChange({ ...value, rows: move(value.rows, rowIndex, 1) })}
                >
                  <ArrowRight />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete row ${rowIndex + 1}`}
                  disabled={value.rows.length === 1}
                  onClick={() => {
                    const removedWidgetIds = new Set(row.widgets.map((widget) => widget.id));
                    onChange({
                      ...value,
                      rows: value.rows.filter((candidate) => candidate.id !== row.id),
                      interactions: value.interactions.filter(
                        (interaction) =>
                          !removedWidgetIds.has(interaction.sourceWidgetId) &&
                          !removedWidgetIds.has(interaction.targetWidgetId),
                      ),
                    });
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {row.widgets.map((widget, widgetIndex) => (
                <div key={widget.id} className="space-y-2 rounded bg-muted/40 p-2">
                  <div className="flex gap-1">
                    <Select
                      value={widget.viewId}
                      onValueChange={(viewId) =>
                        onChange({
                          ...value,
                          rows: value.rows.map((candidate) =>
                            candidate.id === row.id
                              ? {
                                  ...candidate,
                                  widgets: candidate.widgets.map((item) =>
                                    item.id === widget.id ? { ...item, viewId } : item,
                                  ),
                                }
                              : candidate,
                          ),
                          interactions: value.interactions.filter(
                            (interaction) =>
                              interaction.sourceWidgetId !== widget.id &&
                              interaction.targetWidgetId !== widget.id,
                          ),
                        })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`View for widget ${widgetIndex + 1} in row ${rowIndex + 1}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleViews.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.name} · {candidate.layout.type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(widget.width)}
                      onValueChange={(width) =>
                        onChange({
                          ...value,
                          rows: value.rows.map((candidate) =>
                            candidate.id === row.id
                              ? {
                                  ...candidate,
                                  widgets: candidate.widgets.map((item) =>
                                    item.id === widget.id
                                      ? { ...item, width: Number(width) }
                                      : item,
                                  ),
                                }
                              : candidate,
                          ),
                        })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-20"
                        aria-label={`Width for widget ${widgetIndex + 1} in row ${rowIndex + 1}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((width) => (
                          <SelectItem
                            key={width}
                            value={String(width)}
                            disabled={usedWidth - widget.width + width > 4}
                          >
                            {width}/4
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={widget.title ?? ''}
                    maxLength={200}
                    placeholder="Optional widget title"
                    aria-label={`Title for widget ${widgetIndex + 1} in row ${rowIndex + 1}`}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        rows: value.rows.map((candidate) =>
                          candidate.id === row.id
                            ? {
                                ...candidate,
                                widgets: candidate.widgets.map((item) =>
                                  item.id === widget.id
                                    ? {
                                        ...item,
                                        ...(event.currentTarget.value.trim()
                                          ? { title: event.currentTarget.value }
                                          : { title: undefined }),
                                      }
                                    : item,
                                ),
                              }
                            : candidate,
                        ),
                      })
                    }
                  />
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move widget ${widgetIndex + 1} left`}
                      disabled={widgetIndex === 0}
                      onClick={() =>
                        onChange({
                          ...value,
                          rows: value.rows.map((candidate) =>
                            candidate.id === row.id
                              ? { ...candidate, widgets: move(candidate.widgets, widgetIndex, -1) }
                              : candidate,
                          ),
                        })
                      }
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move widget ${widgetIndex + 1} right`}
                      disabled={widgetIndex === row.widgets.length - 1}
                      onClick={() =>
                        onChange({
                          ...value,
                          rows: value.rows.map((candidate) =>
                            candidate.id === row.id
                              ? { ...candidate, widgets: move(candidate.widgets, widgetIndex, 1) }
                              : candidate,
                          ),
                        })
                      }
                    >
                      <ArrowRight />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete widget ${widgetIndex + 1} in row ${rowIndex + 1}`}
                      disabled={row.widgets.length === 1}
                      onClick={() =>
                        onChange({
                          ...value,
                          rows: value.rows.map((candidate) =>
                            candidate.id === row.id
                              ? {
                                  ...candidate,
                                  widgets: candidate.widgets.filter(
                                    (item) => item.id !== widget.id,
                                  ),
                                }
                              : candidate,
                          ),
                          interactions: value.interactions.filter(
                            (interaction) =>
                              interaction.sourceWidgetId !== widget.id &&
                              interaction.targetWidgetId !== widget.id,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                row.widgets.length >= 4 ||
                widgetCount >= 12 ||
                usedWidth >= 4 ||
                eligibleViews.length === 0
              }
              onClick={() =>
                defaultWidgetView &&
                onChange({
                  ...value,
                  rows: value.rows.map((candidate) =>
                    candidate.id === row.id
                      ? {
                          ...candidate,
                          widgets: [
                            ...candidate.widgets,
                            { id: id('dshw'), viewId: defaultWidgetView.id, width: 1 },
                          ],
                        }
                      : candidate,
                  ),
                })
              }
            >
              <Plus /> Add widget
            </Button>
          </div>
        );
      })}

      <div className="space-y-2 rounded border p-3">
        <div className="flex items-center justify-between gap-2">
          <strong>
            <Trans>Global filters</Trans>
          </strong>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={value.globalFilters.length >= 20 || database.sources.length === 0}
            onClick={() => {
              const source = database.sources[0];
              const property = source?.properties[0];
              if (!source || !property) return;
              onChange({
                ...value,
                globalFilters: [
                  ...value.globalFilters,
                  {
                    id: id('dshf'),
                    key: `filter-${value.globalFilters.length + 1}`,
                    name: `Filter ${value.globalFilters.length + 1}`,
                    enabledByDefault: true,
                    clauses: [
                      {
                        sourceId: source.id,
                        where: { propertyId: property.id, operator: 'is_not_empty' },
                      },
                    ],
                  },
                ],
              });
            }}
          >
            <Plus /> Add filter
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Each source clause is independently typed and permission checked. Complex clauses remain
          editable through the manifest and agent data plane.
        </p>
        {value.globalFilters.map((filter) => {
          const unusedSource = database.sources.find(
            (source) => !filter.clauses.some((clause) => clause.sourceId === source.id),
          );
          return (
            <div key={filter.id} className="space-y-2 rounded bg-muted/40 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-40 flex-1"
                  value={filter.name}
                  aria-label={`Name for dashboard filter ${filter.key}`}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      globalFilters: value.globalFilters.map((candidate) =>
                        candidate.id === filter.id
                          ? { ...candidate, name: event.currentTarget.value }
                          : candidate,
                      ),
                    })
                  }
                />
                <div className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={filter.enabledByDefault}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...value,
                        globalFilters: value.globalFilters.map((candidate) =>
                          candidate.id === filter.id
                            ? { ...candidate, enabledByDefault: checked === true }
                            : candidate,
                        ),
                      })
                    }
                  />
                  Enabled initially
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!unusedSource?.properties[0]}
                  onClick={() => {
                    const property = unusedSource?.properties[0];
                    if (!unusedSource || !property) return;
                    onChange({
                      ...value,
                      globalFilters: value.globalFilters.map((candidate) =>
                        candidate.id === filter.id
                          ? {
                              ...candidate,
                              clauses: [
                                ...candidate.clauses,
                                {
                                  sourceId: unusedSource.id,
                                  where: { propertyId: property.id, operator: 'is_not_empty' },
                                },
                              ],
                            }
                          : candidate,
                      ),
                    });
                  }}
                >
                  <Plus /> Add source
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete dashboard filter ${filter.name}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      globalFilters: value.globalFilters.filter(
                        (candidate) => candidate.id !== filter.id,
                      ),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {filter.clauses.map((clause, clauseIndex) => {
                const clauseSource = database.sources.find(
                  (source) => source.id === clause.sourceId,
                );
                const simpleWhere =
                  'propertyId' in clause.where && 'operator' in clause.where
                    ? (clause.where as Extract<DatabaseFilter, { propertyId: string }>)
                    : null;
                return (
                  <div
                    key={clause.sourceId}
                    className="flex flex-wrap items-center gap-2 rounded border bg-background p-2"
                  >
                    <Select
                      value={clause.sourceId}
                      onValueChange={(sourceId) => {
                        const nextSource = database.sources.find(
                          (source) => source.id === sourceId,
                        );
                        const property = nextSource?.properties[0];
                        if (!property) return;
                        onChange({
                          ...value,
                          globalFilters: value.globalFilters.map((candidate) =>
                            candidate.id === filter.id
                              ? {
                                  ...candidate,
                                  clauses: candidate.clauses.map((item, index) =>
                                    index === clauseIndex
                                      ? {
                                          sourceId,
                                          where: {
                                            propertyId: property.id,
                                            operator: 'is_not_empty',
                                          },
                                        }
                                      : item,
                                  ),
                                }
                              : candidate,
                          ),
                        });
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`Source ${clauseIndex + 1} for filter ${filter.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {database.sources.map((source) => (
                          <SelectItem
                            key={source.id}
                            value={source.id}
                            disabled={filter.clauses.some(
                              (item, index) => index !== clauseIndex && item.sourceId === source.id,
                            )}
                          >
                            {source.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {simpleWhere ? (
                      <>
                        <Select
                          value={simpleWhere.propertyId}
                          onValueChange={(propertyId) =>
                            onChange({
                              ...value,
                              globalFilters: value.globalFilters.map((candidate) =>
                                candidate.id === filter.id
                                  ? {
                                      ...candidate,
                                      clauses: candidate.clauses.map((item, index) =>
                                        index === clauseIndex
                                          ? {
                                              ...item,
                                              where: { propertyId, operator: 'is_not_empty' },
                                            }
                                          : item,
                                      ),
                                    }
                                  : candidate,
                              ),
                            })
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`Property ${clauseIndex + 1} for filter ${filter.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {clauseSource?.properties.map((property) => (
                              <SelectItem key={property.id} value={property.id}>
                                {property.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={simpleWhere.operator === 'is_empty' ? 'is_empty' : 'is_not_empty'}
                          onValueChange={(operator) =>
                            onChange({
                              ...value,
                              globalFilters: value.globalFilters.map((candidate) =>
                                candidate.id === filter.id
                                  ? {
                                      ...candidate,
                                      clauses: candidate.clauses.map((item, index) =>
                                        index === clauseIndex
                                          ? {
                                              ...item,
                                              where: {
                                                propertyId: simpleWhere.propertyId,
                                                operator: operator as 'is_empty' | 'is_not_empty',
                                              },
                                            }
                                          : item,
                                      ),
                                    }
                                  : candidate,
                              ),
                            })
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`Operator ${clauseIndex + 1} for filter ${filter.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="is_not_empty">Is not empty</SelectItem>
                            <SelectItem value="is_empty">Is empty</SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <code className="min-w-0 flex-1 truncate text-xs">
                        {JSON.stringify(clause.where)}
                      </code>
                    )}
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={filter.clauses.length === 1}
                      aria-label={`Delete source ${clauseIndex + 1} from filter ${filter.name}`}
                      onClick={() =>
                        onChange({
                          ...value,
                          globalFilters: value.globalFilters.map((candidate) =>
                            candidate.id === filter.id
                              ? {
                                  ...candidate,
                                  clauses: candidate.clauses.filter(
                                    (_, index) => index !== clauseIndex,
                                  ),
                                }
                              : candidate,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 rounded border p-3">
        <div className="flex items-center justify-between gap-2">
          <strong>
            <Trans>Linked interactions</Trans>
          </strong>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={interactionCandidates.length === 0 || value.interactions.length >= 24}
            onClick={() => {
              const candidate = interactionCandidates.find(
                (item) =>
                  !value.interactions.some(
                    (interaction) =>
                      interaction.sourceWidgetId === item.sourceWidget.id &&
                      interaction.targetWidgetId === item.targetWidget.id &&
                      interaction.targetRelationPropertyId === item.property.id,
                  ),
              );
              if (!candidate) return;
              onChange({
                ...value,
                interactions: [
                  ...value.interactions,
                  {
                    sourceWidgetId: candidate.sourceWidget.id,
                    targetWidgetId: candidate.targetWidget.id,
                    targetRelationPropertyId: candidate.property.id,
                  },
                ],
              });
            }}
          >
            <Plus /> Add linked selection
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Selecting a record in the source widget filters the target widget through a compatible
          Relation property.
        </p>
        {value.interactions.map((interaction, index) => {
          const sourceWidget = widgetEntries.find(
            (widget) => widget.id === interaction.sourceWidgetId,
          );
          const targetWidget = widgetEntries.find(
            (widget) => widget.id === interaction.targetWidgetId,
          );
          const sourceView = database.views.find(
            (candidate) => candidate.id === sourceWidget?.viewId,
          );
          const targetView = database.views.find(
            (candidate) => candidate.id === targetWidget?.viewId,
          );
          return (
            <div
              key={`${interaction.sourceWidgetId}:${interaction.targetWidgetId}:${interaction.targetRelationPropertyId}`}
              className="flex items-center justify-between gap-2 rounded bg-muted/40 p-2 text-sm"
            >
              <span>
                {sourceView?.name ?? interaction.sourceWidgetId} →{' '}
                {targetView?.name ?? interaction.targetWidgetId}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete linked interaction ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    interactions: value.interactions.filter((_, candidate) => candidate !== index),
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
