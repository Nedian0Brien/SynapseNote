import { Trans } from '@lingui/react/macro';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { ChevronDown, ChevronUp, Copy, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DatabaseViewLifecycleChange } from '@/lib/database-cell-mutation';
import {
  createDefaultDatabaseBoardView,
  createDefaultDatabaseCalendarView,
  createDefaultDatabaseChartView,
  createDefaultDatabaseDashboardView,
  createDefaultDatabaseFeedView,
  createDefaultDatabaseFormView,
  createDefaultDatabaseGalleryView,
  createDefaultDatabaseListView,
  createDefaultDatabaseMapView,
  createDefaultDatabaseTableView,
  createDefaultDatabaseTimelineView,
  defaultDatabaseBoardGroupProperty,
  defaultDatabaseChartDimensionProperty,
  defaultDatabaseDashboardWidgetViews,
  defaultDatabaseFeedChronologyProperty,
  defaultDatabaseMapPlaceProperty,
  defaultDatabaseTimelineDateProperty,
  duplicateDatabaseView,
} from '@/lib/database-view-lifecycle';

export type DatabaseViewManagerInitialAction =
  | { kind: 'duplicate'; viewId: string }
  | { kind: 'favorite'; viewId: string; favorite: boolean }
  | { kind: 'reorder'; viewId: string; direction: -1 | 1 }
  | { kind: 'delete'; viewId: string };

export function DatabaseViewManagerDialog({
  open,
  onOpenChange,
  source,
  views,
  busy,
  initialAction,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DatabaseSource;
  views: readonly DatabaseView[];
  busy: boolean;
  initialAction?: DatabaseViewManagerInitialAction;
  onChange: (change: DatabaseViewLifecycleChange) => void;
}) {
  'use no memo';
  const handledInitialAction = useRef<string | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [newViewLayout, setNewViewLayout] = useState<
    | 'table'
    | 'board'
    | 'timeline'
    | 'calendar'
    | 'list'
    | 'gallery'
    | 'chart'
    | 'form'
    | 'map'
    | 'dashboard'
    | 'feed'
  >('table');
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(views.map((view) => [view.id, view.name])),
  );
  const [deleteViewId, setDeleteViewId] = useState<string | null>(null);

  const newViewLayoutSuggestion = (() => {
    switch (newViewLayout) {
      case 'board': {
        const property = defaultDatabaseBoardGroupProperty(source);
        return property
          ? `Groups cards by ${property.name}.`
          : 'Choose a Status, Select, Relation, Person, or Checkbox property first.';
      }
      case 'timeline': {
        const property = defaultDatabaseTimelineDateProperty(source);
        return property
          ? `Maps the timeline to ${property.name}.`
          : 'Add a Date property to enable Timeline.';
      }
      case 'calendar': {
        const property = defaultDatabaseTimelineDateProperty(source);
        return property
          ? `Places records on ${property.name}.`
          : 'Add a Date property to enable Calendar.';
      }
      case 'gallery': {
        const property = source.properties.find((candidate) => candidate.type === 'files');
        return property
          ? `Uses ${property.name} as the card preview.`
          : 'Cards start with titles; add Files later for image previews.';
      }
      case 'chart': {
        const property = defaultDatabaseChartDimensionProperty(source);
        return property
          ? `Starts with ${property.name} as the chart dimension.`
          : 'Add a chartable property to enable Chart.';
      }
      case 'map': {
        const property = defaultDatabaseMapPlaceProperty(source);
        return property ? `Maps ${property.name} values.` : 'Add a Place property to enable Map.';
      }
      case 'feed': {
        const property = defaultDatabaseFeedChronologyProperty(source);
        return property
          ? `Orders entries by ${property.name}.`
          : 'Add a date or edit-time property to enable Feed.';
      }
      case 'dashboard': {
        const count = defaultDatabaseDashboardWidgetViews(source, views).length;
        return count > 0
          ? `Starts with ${count} existing view${count === 1 ? '' : 's'} as widget candidates.`
          : 'Create another saved view to enable Dashboard widgets.';
      }
      case 'form':
        return 'Starts with the Title property as the required question.';
      case 'list':
        return 'Shows source properties in a compact list; refine projection later.';
      default:
        return 'Shows source properties in a table; refine projection later.';
    }
  })();

  useEffect(() => {
    setNames((current) => {
      const next = Object.fromEntries(
        views.map((view) => [view.id, current[view.id] ?? view.name]),
      );
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (
        currentKeys.length === nextKeys.length &&
        currentKeys.every((key) => current[key] === next[key])
      ) {
        return current;
      }
      return next;
    });
  }, [views]);

  useEffect(() => {
    if (!open || !initialAction || busy) return;
    const actionKey = `${initialAction.kind}:${initialAction.viewId}:${
      'favorite' in initialAction ? initialAction.favorite : ''
    }`;
    if (handledInitialAction.current === actionKey) return;
    const view = views.find((candidate) => candidate.id === initialAction.viewId);
    if (!view) return;
    handledInitialAction.current = actionKey;
    if (initialAction.kind === 'duplicate') {
      onChange({
        kind: 'duplicate',
        view: duplicateDatabaseView({
          view,
          existingViews: views,
          uuid: crypto.randomUUID(),
        }),
      });
      return;
    }
    onChange(initialAction);
  }, [open, initialAction, busy, views, onChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Manage saved views</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Create and organize stable saved views. Each change follows the database mutation
              policy; elevated and agent-authored changes remain reviewed before the manifest
              updates.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Input
                value={newViewName}
                maxLength={200}
                aria-label="New saved view name"
                placeholder="New saved view"
                onChange={(event) => setNewViewName(event.currentTarget.value)}
              />
              <Select
                value={newViewLayout}
                onValueChange={(value) => setNewViewLayout(value as typeof newViewLayout)}
              >
                <SelectTrigger className="w-32" aria-label="New saved view layout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="board" disabled={!defaultDatabaseBoardGroupProperty(source)}>
                    Board
                  </SelectItem>
                  <SelectItem
                    value="timeline"
                    disabled={!defaultDatabaseTimelineDateProperty(source)}
                  >
                    Timeline
                  </SelectItem>
                  <SelectItem
                    value="calendar"
                    disabled={!defaultDatabaseTimelineDateProperty(source)}
                  >
                    Calendar
                  </SelectItem>
                  <SelectItem value="list">List</SelectItem>
                  <SelectItem value="gallery">Gallery</SelectItem>
                  <SelectItem
                    value="chart"
                    disabled={!defaultDatabaseChartDimensionProperty(source)}
                  >
                    Chart
                  </SelectItem>
                  <SelectItem value="form">Form</SelectItem>
                  <SelectItem value="map" disabled={!defaultDatabaseMapPlaceProperty(source)}>
                    Map
                  </SelectItem>
                  <SelectItem
                    value="dashboard"
                    disabled={defaultDatabaseDashboardWidgetViews(source, views).length === 0}
                  >
                    Dashboard
                  </SelectItem>
                  <SelectItem
                    value="feed"
                    disabled={!defaultDatabaseFeedChronologyProperty(source)}
                  >
                    Feed
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={
                  busy ||
                  newViewName.trim().length === 0 ||
                  (newViewLayout === 'board' && !defaultDatabaseBoardGroupProperty(source)) ||
                  (newViewLayout === 'timeline' && !defaultDatabaseTimelineDateProperty(source)) ||
                  (newViewLayout === 'calendar' && !defaultDatabaseTimelineDateProperty(source)) ||
                  (newViewLayout === 'chart' && !defaultDatabaseChartDimensionProperty(source)) ||
                  (newViewLayout === 'map' && !defaultDatabaseMapPlaceProperty(source)) ||
                  (newViewLayout === 'feed' && !defaultDatabaseFeedChronologyProperty(source)) ||
                  (newViewLayout === 'dashboard' &&
                    defaultDatabaseDashboardWidgetViews(source, views).length === 0)
                }
                onClick={() => {
                  onChange({
                    kind: 'create',
                    view:
                      newViewLayout === 'board'
                        ? createDefaultDatabaseBoardView({
                            source,
                            existingViews: views,
                            name: newViewName.trim(),
                            uuid: crypto.randomUUID(),
                          })
                        : newViewLayout === 'timeline'
                          ? createDefaultDatabaseTimelineView({
                              source,
                              existingViews: views,
                              name: newViewName.trim(),
                              uuid: crypto.randomUUID(),
                            })
                          : newViewLayout === 'calendar'
                            ? createDefaultDatabaseCalendarView({
                                source,
                                existingViews: views,
                                name: newViewName.trim(),
                                uuid: crypto.randomUUID(),
                              })
                            : newViewLayout === 'list'
                              ? createDefaultDatabaseListView({
                                  source,
                                  existingViews: views,
                                  name: newViewName.trim(),
                                  uuid: crypto.randomUUID(),
                                })
                              : newViewLayout === 'gallery'
                                ? createDefaultDatabaseGalleryView({
                                    source,
                                    existingViews: views,
                                    name: newViewName.trim(),
                                    uuid: crypto.randomUUID(),
                                  })
                                : newViewLayout === 'chart'
                                  ? createDefaultDatabaseChartView({
                                      source,
                                      existingViews: views,
                                      name: newViewName.trim(),
                                      uuid: crypto.randomUUID(),
                                    })
                                  : newViewLayout === 'form'
                                    ? createDefaultDatabaseFormView({
                                        source,
                                        existingViews: views,
                                        name: newViewName.trim(),
                                        uuid: crypto.randomUUID(),
                                      })
                                    : newViewLayout === 'map'
                                      ? createDefaultDatabaseMapView({
                                          source,
                                          existingViews: views,
                                          name: newViewName.trim(),
                                          uuid: crypto.randomUUID(),
                                        })
                                      : newViewLayout === 'dashboard'
                                        ? createDefaultDatabaseDashboardView({
                                            source,
                                            existingViews: views,
                                            name: newViewName.trim(),
                                            uuid: crypto.randomUUID(),
                                          })
                                        : newViewLayout === 'feed'
                                          ? createDefaultDatabaseFeedView({
                                              source,
                                              existingViews: views,
                                              name: newViewName.trim(),
                                              uuid: crypto.randomUUID(),
                                            })
                                          : createDefaultDatabaseTableView({
                                              source,
                                              existingViews: views,
                                              name: newViewName.trim(),
                                              uuid: crypto.randomUUID(),
                                            }),
                  });
                  setNewViewName('');
                }}
              >
                <Plus /> <Trans>Review create</Trans>
              </Button>
            </div>
            <p className="text-muted-foreground text-xs" data-testid="new-view-layout-suggestion">
              <Trans>Suggested starter:</Trans> {newViewLayoutSuggestion}
            </p>
          </div>

          <section className="space-y-2" aria-label="Saved views">
            {views.length === 0 ? (
              <p className="rounded border border-dashed p-4 text-muted-foreground text-sm">
                <Trans>No saved views for this source.</Trans>
              </p>
            ) : null}
            {views.map((view, index) => {
              const name = names[view.id] ?? view.name;
              const deleting = deleteViewId === view.id;
              const isDefault = source.defaultViewId === view.id;
              return (
                <div
                  key={view.id}
                  className="grid gap-2 rounded border p-3 sm:grid-cols-[minmax(12rem,1fr)_auto]"
                  data-view-id={view.id}
                >
                  <div className="space-y-1">
                    <Input
                      value={name}
                      maxLength={200}
                      aria-label={`Name for ${view.name}`}
                      onChange={(event) => {
                        const nextName = event.currentTarget.value;
                        setNames((current) => ({
                          ...current,
                          [view.id]: nextName,
                        }));
                      }}
                    />
                    <div className="flex gap-2 text-muted-foreground text-xs">
                      <code>{view.key}</code>
                      {isDefault ? <span>Default</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || name.trim().length === 0 || name.trim() === view.name}
                      aria-label={`Review rename ${view.name}`}
                      onClick={() =>
                        onChange({ kind: 'rename', viewId: view.id, name: name.trim() })
                      }
                    >
                      <Trans>Rename</Trans>
                    </Button>
                    <Button
                      type="button"
                      variant={view.favorite === true ? 'secondary' : 'ghost'}
                      size="icon-sm"
                      disabled={busy}
                      aria-label={
                        view.favorite === true
                          ? `Remove ${view.name} from favorites`
                          : `Favorite ${view.name}`
                      }
                      aria-pressed={view.favorite === true}
                      onClick={() =>
                        onChange({
                          kind: 'favorite',
                          viewId: view.id,
                          favorite: view.favorite !== true,
                        })
                      }
                    >
                      <Star />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Duplicate ${view.name}`}
                      onClick={() =>
                        onChange({
                          kind: 'duplicate',
                          view: duplicateDatabaseView({
                            view,
                            existingViews: views,
                            uuid: crypto.randomUUID(),
                          }),
                        })
                      }
                    >
                      <Copy />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy || index === 0}
                      aria-label={`Move ${view.name} up`}
                      onClick={() => onChange({ kind: 'reorder', viewId: view.id, direction: -1 })}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy || index === views.length - 1}
                      aria-label={`Move ${view.name} down`}
                      onClick={() => onChange({ kind: 'reorder', viewId: view.id, direction: 1 })}
                    >
                      <ChevronDown />
                    </Button>
                    {deleting ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy || isDefault || views.length <= 1}
                        aria-label={`Confirm delete ${view.name}`}
                        onClick={() => onChange({ kind: 'delete', viewId: view.id })}
                      >
                        <Trans>Confirm delete</Trans>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy || isDefault || views.length <= 1}
                        aria-label={
                          isDefault
                            ? `Cannot delete default view ${view.name}`
                            : views.length <= 1
                              ? `Cannot delete last view ${view.name}`
                              : `Delete ${view.name}`
                        }
                        onClick={() => setDeleteViewId(view.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
