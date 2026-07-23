import { Trans } from '@lingui/react/macro';
import type {
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import { Braces, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ListRow {
  record: ProjectedDatabaseRecord;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
}

export const DATABASE_LIST_COLORS = {
  gray: 'bg-gray-500/15 text-foreground dark:bg-gray-400/15',
  brown: 'bg-amber-900/15 text-foreground dark:bg-amber-700/20',
  orange: 'bg-orange-500/15 text-foreground dark:bg-orange-400/15',
  yellow: 'bg-yellow-400/20 text-foreground dark:bg-yellow-300/15',
  green: 'bg-green-500/15 text-foreground dark:bg-green-400/15',
  blue: 'bg-blue-500/15 text-foreground dark:bg-blue-400/15',
  purple: 'bg-purple-500/15 text-foreground dark:bg-purple-400/15',
  pink: 'bg-pink-500/15 text-foreground dark:bg-pink-400/15',
  red: 'bg-red-500/15 text-foreground dark:bg-red-400/15',
} as const;

function title(source: DatabaseSource, record: ProjectedDatabaseRecord): string {
  const property = source.properties.find((candidate) => candidate.type === 'title');
  return property ? String(record.values[property.id] ?? 'Untitled') : 'Untitled';
}

function label(
  property: DatabaseProperty,
  value: DatabaseValue | undefined,
  people: readonly ProjectedDatabasePerson[],
  relations: readonly ProjectedDatabaseRelationRecord[],
): string {
  if (value === undefined || value === null || value === '') return '—';
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
  if (property.type === 'person') {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => people.find((person) => person.id === item)?.name ?? String(item))
      .join(', ');
  }
  if (property.type === 'relation') {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => relations.find((record) => record.id === item)?.title ?? String(item))
      .join(', ');
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function sectionLabel(source: DatabaseSource, view: DatabaseView, value: unknown): string {
  const group = view.groups[0];
  const property = group
    ? source.properties.find((candidate) => candidate.id === group.propertyId)
    : undefined;
  if (value === null || value === undefined || value === '')
    return `No ${property?.name ?? 'group'}`;
  if (
    property &&
    (property.type === 'select' || property.type === 'multi_select' || property.type === 'status')
  ) {
    return property.options.find((option) => option.id === value)?.name ?? String(value);
  }
  return String(value);
}

function hierarchyRows(input: {
  records: readonly ProjectedDatabaseRecord[];
  parentPropertyId?: string;
  collapsed: ReadonlySet<string>;
}): ListRow[] {
  if (!input.parentPropertyId) {
    return input.records.map((record) => ({
      record,
      depth: 0,
      parentId: null,
      hasChildren: false,
    }));
  }
  const recordsById = new Map(input.records.map((record) => [record.id, record]));
  const parentById = new Map<string, string | null>();
  const children = new Map<string, ProjectedDatabaseRecord[]>();
  for (const record of input.records) {
    const raw = record.values[input.parentPropertyId];
    const candidate = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
    const parentId =
      candidate && candidate !== record.id && recordsById.has(candidate) ? candidate : null;
    parentById.set(record.id, parentId);
    if (parentId) children.set(parentId, [...(children.get(parentId) ?? []), record]);
  }
  const rows: ListRow[] = [];
  const visited = new Set<string>();
  const append = (record: ProjectedDatabaseRecord, depth: number) => {
    if (visited.has(record.id)) return;
    visited.add(record.id);
    const descendants = children.get(record.id) ?? [];
    rows.push({
      record,
      depth,
      parentId: parentById.get(record.id) ?? null,
      hasChildren: descendants.length > 0,
    });
    if (!input.collapsed.has(record.id)) {
      for (const child of descendants) append(child, depth + 1);
    }
  };
  for (const record of input.records) {
    if (!parentById.get(record.id)) append(record, 0);
  }
  for (const record of input.records) {
    if (visited.has(record.id)) continue;
    const ancestry = new Set<string>();
    let cursor: string | null = record.id;
    while (cursor && !visited.has(cursor) && !ancestry.has(cursor)) {
      ancestry.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
    if (cursor && ancestry.has(cursor)) append(record, 0);
  }
  return rows;
}

export function DatabaseList({
  source,
  view,
  result,
  people = result.people ?? [],
  relationRecords = result.relationRecords ?? [],
  onOpen,
  onOpenContextInspector,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  relationRecords?: readonly ProjectedDatabaseRelationRecord[];
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(() => new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  if (view.layout.type !== 'list') return null;
  const configuration = view.layout.configuration;
  const parentPropertyId =
    configuration.hierarchy.type === 'parent_relation'
      ? configuration.hierarchy.propertyId
      : undefined;
  const projectedProperties = view.projection.propertyIds
    .map((id) => source.properties.find((property) => property.id === id))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined && property.type !== 'title' && property.id !== parentPropertyId,
    );
  const colorRules = new Map(
    (result.conditionalColors?.rules ?? []).map((rule) => [rule.id, rule]),
  );
  const sections = new Map<string, { value: unknown; records: ProjectedDatabaseRecord[] }>();
  for (const record of result.records) {
    const value =
      configuration.showSections && view.groups[0]
        ? result.groupMemberships?.[record.id]?.[0]?.[0]?.value
        : null;
    const key = JSON.stringify(value ?? null);
    const section = sections.get(key) ?? { value, records: [] };
    section.records.push(record);
    sections.set(key, section);
  }
  const toggle = (setter: typeof setCollapsedRows, id: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const moveFocus = (current: HTMLElement, amount: -1 | 1) => {
    const list = current.closest('[data-database-list]');
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>('[data-list-row]')];
    rows[rows.indexOf(current) + amount]?.focus();
  };

  return (
    <div
      aria-label={`${view.name} List`}
      role="tree"
      data-database-list
      className="rounded-lg border"
    >
      {[...sections.entries()].map(([sectionKey, section]) => {
        const sectionName = sectionLabel(source, view, section.value);
        const sectionCollapsed = collapsedSections.has(sectionKey);
        const rows = hierarchyRows({
          records: section.records,
          parentPropertyId,
          collapsed: collapsedRows,
        });
        return (
          <section key={sectionKey} aria-label={sectionName} data-list-section={sectionKey}>
            {configuration.showSections && view.groups[0] ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start rounded-none font-semibold"
                aria-expanded={!sectionCollapsed}
                onClick={() =>
                  configuration.collapsibleSections && toggle(setCollapsedSections, sectionKey)
                }
              >
                {sectionCollapsed ? <ChevronRight /> : <ChevronDown />} {sectionName}{' '}
                <span className="text-muted-foreground">{section.records.length}</span>
              </Button>
            ) : null}
            {!sectionCollapsed
              ? rows.map((row) => {
                  const rowCollapsed = collapsedRows.has(row.record.id);
                  const colorMatch = result.conditionalColors?.records[row.record.id];
                  const pageColor = colorMatch?.pageRuleId
                    ? colorRules.get(colorMatch.pageRuleId)?.color
                    : undefined;
                  return (
                    <div
                      key={row.record.id}
                      tabIndex={0}
                      role="treeitem"
                      aria-level={row.depth + 1}
                      aria-expanded={row.hasChildren ? !rowCollapsed : undefined}
                      data-list-row={row.record.id}
                      data-list-depth={row.depth}
                      className={cn(
                        'flex items-center gap-2 px-2 outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        configuration.density === 'compact' ? 'min-h-8' : 'min-h-11',
                        configuration.showDividers && 'border-t',
                        pageColor ? DATABASE_LIST_COLORS[pageColor] : undefined,
                      )}
                      style={{ paddingLeft: `${row.depth * 1.25 + 0.5}rem` }}
                      onClick={() => onOpen?.(row.record)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          moveFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
                        } else if (event.key === 'ArrowRight' && row.hasChildren && rowCollapsed) {
                          event.preventDefault();
                          toggle(setCollapsedRows, row.record.id);
                        } else if (event.key === 'ArrowLeft') {
                          event.preventDefault();
                          if (row.hasChildren && !rowCollapsed)
                            toggle(setCollapsedRows, row.record.id);
                          else if (row.parentId) {
                            document
                              .querySelector<HTMLElement>(
                                `[data-list-row="${CSS.escape(row.parentId)}"]`,
                              )
                              ?.focus();
                          }
                        } else if (event.key === 'Enter') {
                          event.preventDefault();
                          onOpen?.(row.record);
                        }
                      }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className={cn(!row.hasChildren && 'invisible')}
                        aria-label={`${rowCollapsed ? 'Expand' : 'Collapse'} ${title(source, row.record)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(setCollapsedRows, row.record.id);
                        }}
                      >
                        {rowCollapsed ? <ChevronRight /> : <ChevronDown />}
                      </Button>
                      {onOpen ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto min-w-0 flex-1 justify-start truncate p-0 text-left font-medium"
                          data-record-title-link={row.record.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpen(row.record);
                          }}
                        >
                          {title(source, row.record)}
                        </Button>
                      ) : (
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {title(source, row.record)}
                        </span>
                      )}
                      {projectedProperties.map((property) =>
                        (() => {
                          const ruleId = colorMatch?.propertyRuleIds?.[property.id];
                          const propertyColor = ruleId ? colorRules.get(ruleId)?.color : undefined;
                          return (
                            <span
                              key={property.id}
                              className={cn(
                                'max-w-40 truncate text-muted-foreground text-xs',
                                propertyColor ? DATABASE_LIST_COLORS[propertyColor] : undefined,
                              )}
                              data-list-property={property.id}
                              data-conditional-color={propertyColor}
                            >
                              {label(
                                property,
                                row.record.values[property.id],
                                people,
                                relationRecords,
                              )}
                            </span>
                          );
                        })(),
                      )}
                      {onOpen ? <ExternalLink className="size-3 text-muted-foreground" /> : null}
                      {onOpenContextInspector ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Inspect context for record ${title(source, row.record)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenContextInspector(row.record);
                          }}
                        >
                          <Braces aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </section>
        );
      })}
      {result.records.length === 0 ? (
        <p className="p-6 text-center text-muted-foreground text-sm">
          <Trans>No records in this list.</Trans>
        </p>
      ) : null}
    </div>
  );
}
