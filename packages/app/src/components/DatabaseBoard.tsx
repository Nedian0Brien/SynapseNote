import { Trans } from '@lingui/react/macro';
import type {
  DatabaseFileValue,
  DatabaseGroupMembershipKey,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  databaseFileDisplayName,
  mediaKindForSidebarAssetExtension,
  toDesktopAssetHref,
} from '@nedian0brien/synapsenote-core';
import { Archive, Braces, Copy, ExternalLink, GripVertical, MoveRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface DatabaseBoardTransition {
  record: ProjectedDatabaseRecord;
  changes: Array<{ property: DatabaseProperty; value: DatabaseValue | undefined }>;
}

interface BoardGroup {
  value: DatabaseValue | null;
  key: string;
  label: string;
}

const COLUMN_COLORS = [
  'bg-blue-500/5 border-blue-500/20',
  'bg-purple-500/5 border-purple-500/20',
  'bg-green-500/5 border-green-500/20',
  'bg-orange-500/5 border-orange-500/20',
  'bg-pink-500/5 border-pink-500/20',
] as const;

const CARD_COLORS = {
  gray: 'bg-gray-500/15',
  brown: 'bg-amber-900/15',
  orange: 'bg-orange-500/15',
  yellow: 'bg-yellow-400/20',
  green: 'bg-green-500/15',
  blue: 'bg-blue-500/15',
  purple: 'bg-purple-500/15',
  pink: 'bg-pink-500/15',
  red: 'bg-red-500/15',
} as const;

function valueKey(value: DatabaseValue | null): string {
  return value === null ? 'null' : JSON.stringify(value);
}

function propertyValueLabel(
  property: DatabaseProperty,
  value: DatabaseValue | null | undefined,
  people: readonly ProjectedDatabasePerson[],
  relationRecords: readonly ProjectedDatabaseRelationRecord[],
): string {
  if (value === null || value === undefined || value === '') return `No ${property.name}`;
  if (
    property.type === 'select' ||
    property.type === 'multi_select' ||
    property.type === 'status'
  ) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => property.options.find((option) => option.id === item)?.name ?? String(item))
      .join(', ');
  }
  if (
    property.type === 'person' ||
    property.type === 'created_by' ||
    property.type === 'last_edited_by'
  ) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => people.find((person) => person.id === item)?.name ?? String(item))
      .join(', ');
  }
  if (property.type === 'relation') {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => relationRecords.find((record) => record.id === item)?.title ?? String(item))
      .join(', ');
  }
  if (property.type === 'files' && Array.isArray(value)) {
    return (value as DatabaseFileValue[]).map(databaseFileDisplayName).join(', ');
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function definedGroupValues(property: DatabaseProperty): DatabaseValue[] {
  if (
    property.type === 'select' ||
    property.type === 'multi_select' ||
    property.type === 'status'
  ) {
    return property.options.filter((option) => option.archived !== true).map((option) => option.id);
  }
  if (property.type === 'checkbox') return [false, true];
  return [];
}

function boardGroups(input: {
  property: DatabaseProperty;
  memberships: DatabaseGroupMembershipKey[];
  level: number;
  hideEmpty: boolean;
  direction: 'asc' | 'desc';
  people: readonly ProjectedDatabasePerson[];
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
  limit: number;
}): BoardGroup[] {
  const observed = input.memberships.flatMap((membership) => {
    const item = membership[input.level];
    return item?.propertyId === input.property.id ? [item.value] : [];
  });
  const values = input.hideEmpty
    ? observed
    : [...definedGroupValues(input.property), ...observed, null];
  const unique = [...new Map(values.map((value) => [valueKey(value), value])).values()];
  const definedOrder = new Map(
    definedGroupValues(input.property).map((value, index) => [valueKey(value), index]),
  );
  const sorted = unique.sort((left, right) => {
    if (left === null) return 1;
    if (right === null) return -1;
    const leftOrder = definedOrder.get(valueKey(left));
    const rightOrder = definedOrder.get(valueKey(right));
    const compared =
      leftOrder !== undefined && rightOrder !== undefined
        ? leftOrder - rightOrder
        : propertyValueLabel(
            input.property,
            left,
            input.people,
            input.relationRecords,
          ).localeCompare(
            propertyValueLabel(input.property, right, input.people, input.relationRecords),
          );
    return input.direction === 'asc' ? compared : -compared;
  });
  return sorted.slice(0, input.limit).map((value) => ({
    value,
    key: valueKey(value),
    label: propertyValueLabel(input.property, value, input.people, input.relationRecords),
  }));
}

function transitionedValue(
  property: DatabaseProperty,
  current: DatabaseValue | undefined,
  source: DatabaseValue | null,
  target: DatabaseValue | null,
): DatabaseValue | undefined {
  if (
    property.type === 'multi_select' ||
    property.type === 'person' ||
    (property.type === 'relation' && property.cardinality !== 'one')
  ) {
    const values = Array.isArray(current) ? [...(current as string[])] : [];
    const withoutSource =
      typeof source === 'string' ? values.filter((value) => value !== source) : values;
    if (typeof target === 'string' && !withoutSource.includes(target)) withoutSource.push(target);
    return withoutSource;
  }
  return target === null ? undefined : target;
}

function canTransition(property: DatabaseProperty): boolean {
  return ![
    'button',
    'unique_id',
    'formula',
    'rollup',
    'created_time',
    'last_edited_time',
    'created_by',
    'last_edited_by',
    'title',
    'files',
  ].includes(property.type);
}

function localCoverHref(file: DatabaseFileValue): string | null {
  if (file.kind !== 'local') return null;
  const extension = file.path.split('.').pop() ?? '';
  if (mediaKindForSidebarAssetExtension(extension) !== 'image') return null;
  return toDesktopAssetHref(`/api/asset?path=${encodeURIComponent(file.path)}`);
}

export function DatabaseBoard({
  source,
  view,
  result,
  people = result.people ?? [],
  relationRecords = result.relationRecords ?? [],
  mutationLocked = false,
  onOpen,
  onOpenContextInspector,
  onTransition,
  onDuplicate,
  onArchive,
  onRequestMove,
  onDelete,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  relationRecords?: readonly ProjectedDatabaseRelationRecord[];
  mutationLocked?: boolean;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
  onTransition?: (transition: DatabaseBoardTransition) => void;
  onDuplicate?: (record: ProjectedDatabaseRecord) => void;
  onArchive?: (record: ProjectedDatabaseRecord, action: 'archive' | 'restore') => void;
  onRequestMove?: (record: ProjectedDatabaseRecord) => void;
  onDelete?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const [dragging, setDragging] = useState<{
    recordId: string;
    primary: DatabaseValue | null;
    subgroup: DatabaseValue | null;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  if (view.layout.type !== 'board') return null;
  const configuration = view.layout.configuration;
  const primary = view.groups[0];
  const subgroup = view.groups[1];
  const primaryProperty = source.properties.find((property) => property.id === primary?.propertyId);
  const subgroupProperty = source.properties.find(
    (property) => property.id === subgroup?.propertyId,
  );
  if (!primary || !primaryProperty) {
    return (
      <div
        className="rounded border border-destructive/30 p-4 text-destructive text-sm"
        role="alert"
      >
        <Trans>This Board view has no valid primary group.</Trans>
      </div>
    );
  }
  const memberships = Object.values(result.groupMemberships ?? {}).flat();
  const columns = boardGroups({
    property: primaryProperty,
    memberships,
    level: 0,
    hideEmpty: primary.hideEmpty,
    direction: primary.direction,
    people,
    relationRecords,
    limit: configuration.groupLimit,
  });
  const lanes =
    subgroup && subgroupProperty
      ? boardGroups({
          property: subgroupProperty,
          memberships,
          level: 1,
          hideEmpty: subgroup.hideEmpty,
          direction: subgroup.direction,
          people,
          relationRecords,
          limit: configuration.groupLimit,
        })
      : [{ value: null, key: '__single_lane__', label: '' }];
  const rules = new Map((result.conditionalColors?.rules ?? []).map((rule) => [rule.id, rule]));
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const cardProperties = view.projection.propertyIds
    .map((propertyId) => source.properties.find((property) => property.id === propertyId))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined && property.id !== titleProperty?.id,
    );
  const previewConfiguration = configuration.cardPreview;
  const previewProperty =
    previewConfiguration.type === 'files'
      ? source.properties.find((property) => property.id === previewConfiguration.propertyId)
      : undefined;

  const commitTransition = (
    record: ProjectedDatabaseRecord,
    fromPrimary: DatabaseValue | null,
    targetPrimary: DatabaseValue | null,
    fromSubgroup: DatabaseValue | null,
    targetSubgroup: DatabaseValue | null,
  ) => {
    const changes: DatabaseBoardTransition['changes'] = [];
    if (valueKey(fromPrimary) !== valueKey(targetPrimary)) {
      changes.push({
        property: primaryProperty,
        value: transitionedValue(
          primaryProperty,
          record.values[primaryProperty.id],
          fromPrimary,
          targetPrimary,
        ),
      });
    }
    if (subgroupProperty && valueKey(fromSubgroup) !== valueKey(targetSubgroup)) {
      changes.push({
        property: subgroupProperty,
        value: transitionedValue(
          subgroupProperty,
          record.values[subgroupProperty.id],
          fromSubgroup,
          targetSubgroup,
        ),
      });
    }
    if (changes.length > 0) {
      onTransition?.({ record, changes });
      const targetLabels = [
        `${primaryProperty.name}: ${propertyValueLabel(primaryProperty, targetPrimary, people, relationRecords)}`,
        ...(subgroupProperty
          ? [
              `${subgroupProperty.name}: ${propertyValueLabel(
                subgroupProperty,
                targetSubgroup,
                people,
                relationRecords,
              )}`,
            ]
          : []),
      ];
      setAnnouncement(`Moved record ${record.id} to ${targetLabels.join(', ')}`);
    }
  };

  return (
    <section
      aria-label={`${view.name} Board`}
      className="space-y-4"
      data-database-board
      data-groups-complete={result.aggregation?.groupsComplete ?? true}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {result.aggregation?.truncatedBy === 'group_limit' ? (
        <div
          className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-sm"
          role="status"
        >
          Showing {result.aggregation.returnedGroups} of {result.aggregation.totalGroups} groups at
          the saved Board limit.
        </div>
      ) : null}
      {lanes.map((lane) => (
        <section
          key={lane.key}
          className="space-y-2"
          data-board-swimlane={lane.key}
          aria-label={subgroupProperty ? `${subgroupProperty.name}: ${lane.label}` : 'Board groups'}
        >
          {subgroupProperty ? (
            <h4 className="sticky left-0 font-medium text-sm">
              {subgroupProperty.name}: {lane.label}
            </h4>
          ) : null}
          <div className="flex min-w-max items-start gap-3 overflow-x-auto pb-2">
            {columns.map((column, columnIndex) => {
              const cards = result.records.flatMap((record) => {
                const matchingMembership = (result.groupMemberships?.[record.id] ?? []).find(
                  (membership) =>
                    valueKey(membership[0]?.value ?? null) === column.key &&
                    (!subgroupProperty || valueKey(membership[1]?.value ?? null) === lane.key),
                );
                return matchingMembership ? [{ record, membership: matchingMembership }] : [];
              });
              const exactGroup = result.aggregation?.groups.find((group) => {
                const expectedLevel = subgroupProperty ? 2 : 1;
                return (
                  group.level === expectedLevel &&
                  valueKey(group.key[0]?.value ?? null) === column.key &&
                  (!subgroupProperty || valueKey(group.key[1]?.value ?? null) === lane.key)
                );
              });
              const shown = cards.slice(0, configuration.cardLimitPerGroup);
              return (
                <fieldset
                  key={column.key}
                  aria-label={`${column.label} Board group`}
                  className={cn(
                    'w-72 shrink-0 rounded-lg border p-2',
                    configuration.colorColumns && COLUMN_COLORS[columnIndex % COLUMN_COLORS.length],
                  )}
                  data-board-group={column.key}
                  onDragOver={(event) => {
                    if (dragging && !mutationLocked) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const active = dragging;
                    setDragging(null);
                    const record = result.records.find(
                      (candidate) => candidate.id === active?.recordId,
                    );
                    if (!active || !record || mutationLocked) return;
                    commitTransition(
                      record,
                      active.primary,
                      column.value,
                      active.subgroup,
                      lane.value,
                    );
                  }}
                >
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <strong className="truncate text-sm">{column.label}</strong>
                    <span className="text-muted-foreground text-xs">
                      {exactGroup?.matched ?? cards.length}
                    </span>
                  </header>
                  <ul className="list-none space-y-2" aria-label={`${column.label} records`}>
                    {shown.map(({ record, membership }, cardIndex) => {
                      const pageRuleId = result.conditionalColors?.records[record.id]?.pageRuleId;
                      const pageRule = pageRuleId ? rules.get(pageRuleId) : undefined;
                      const previewFiles =
                        previewProperty?.type === 'files' &&
                        Array.isArray(record.values[previewProperty.id])
                          ? (record.values[previewProperty.id] as DatabaseFileValue[])
                          : [];
                      const cover = previewFiles.map(localCoverHref).find(Boolean) ?? null;
                      return (
                        <li
                          key={`${lane.key}:${column.key}:${record.id}`}
                          className={cn(
                            'overflow-hidden rounded-md border bg-background shadow-sm',
                            configuration.cardSize === 'small' ? 'text-xs' : 'text-sm',
                            pageRule && CARD_COLORS[pageRule.color],
                          )}
                          draggable={
                            !mutationLocked &&
                            !!onTransition &&
                            canTransition(primaryProperty) &&
                            (!subgroupProperty || canTransition(subgroupProperty))
                          }
                          data-board-card={record.id}
                          aria-label={`Record ${record.id}`}
                          aria-posinset={cardIndex + 1}
                          aria-setsize={exactGroup?.matched ?? cards.length}
                          data-conditional-color={pageRule?.color}
                          onDragStart={() =>
                            setDragging({
                              recordId: record.id,
                              primary: membership[0]?.value ?? null,
                              subgroup: membership[1]?.value ?? null,
                            })
                          }
                          onDragEnd={() => setDragging(null)}
                        >
                          {cover ? (
                            <img
                              src={cover}
                              alt=""
                              className={cn(
                                'h-28 w-full bg-muted',
                                configuration.fitImage ? 'object-contain' : 'object-cover',
                              )}
                              loading="lazy"
                            />
                          ) : null}
                          <div className="space-y-2 p-3">
                            <div className="flex items-start gap-1">
                              <GripVertical
                                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto min-w-0 flex-1 justify-start p-0 text-left font-medium"
                                onClick={() => onOpen?.(record)}
                              >
                                {propertyValueLabel(
                                  titleProperty ?? primaryProperty,
                                  titleProperty
                                    ? record.values[titleProperty.id]
                                    : record.values[primaryProperty.id],
                                  people,
                                  relationRecords,
                                )}
                              </Button>
                              {onOpen ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Open record ${record.id}`}
                                  onClick={() => onOpen(record)}
                                >
                                  <ExternalLink />
                                </Button>
                              ) : null}
                            </div>
                            {cardProperties.map((property) => (
                              <div key={property.id} className="flex gap-2 text-xs">
                                <span className="text-muted-foreground">{property.name}</span>
                                <span className="ml-auto max-w-40 truncate">
                                  {propertyValueLabel(
                                    property,
                                    record.values[property.id],
                                    people,
                                    relationRecords,
                                  )}
                                </span>
                              </div>
                            ))}
                            {onTransition && canTransition(primaryProperty) ? (
                              <Select
                                value={column.key}
                                disabled={mutationLocked}
                                onValueChange={(targetKey) => {
                                  const target = columns.find(
                                    (candidate) => candidate.key === targetKey,
                                  );
                                  if (target) {
                                    commitTransition(
                                      record,
                                      membership[0]?.value ?? null,
                                      target.value,
                                      membership[1]?.value ?? null,
                                      lane.value,
                                    );
                                  }
                                }}
                              >
                                <SelectTrigger
                                  size="sm"
                                  aria-label={`Move record ${record.id} to group`}
                                  className="w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {columns.map((candidate) => (
                                    <SelectItem key={candidate.key} value={candidate.key}>
                                      {candidate.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                            <div className="flex justify-end gap-1 border-t pt-2">
                              {onDuplicate ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Duplicate record ${record.id}`}
                                  disabled={mutationLocked}
                                  onClick={() => onDuplicate(record)}
                                >
                                  <Copy />
                                </Button>
                              ) : null}
                              {onRequestMove ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Move record ${record.id} to source`}
                                  disabled={mutationLocked}
                                  onClick={() => onRequestMove(record)}
                                >
                                  <MoveRight />
                                </Button>
                              ) : null}
                              {onOpenContextInspector ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Inspect context for record ${record.id}`}
                                  disabled={mutationLocked}
                                  onClick={() => onOpenContextInspector(record)}
                                >
                                  <Braces aria-hidden="true" />
                                </Button>
                              ) : null}
                              {onArchive ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`${record.archivedAt ? 'Restore' : 'Archive'} record ${record.id}`}
                                  disabled={mutationLocked}
                                  onClick={() =>
                                    onArchive(record, record.archivedAt ? 'restore' : 'archive')
                                  }
                                >
                                  <Archive />
                                </Button>
                              ) : null}
                              {onDelete ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Delete record ${record.id}`}
                                  disabled={mutationLocked}
                                  onClick={() => onDelete(record)}
                                >
                                  <Trash2 />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {shown.length === 0 ? (
                      <div className="rounded border border-dashed p-4 text-center text-muted-foreground text-xs">
                        <Trans>No cards</Trans>
                      </div>
                    ) : null}
                    {(exactGroup?.matched ?? cards.length) > shown.length ? (
                      <p className="text-center text-muted-foreground text-xs">
                        Showing {shown.length} of {exactGroup?.matched ?? cards.length}
                      </p>
                    ) : null}
                  </ul>
                </fieldset>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
