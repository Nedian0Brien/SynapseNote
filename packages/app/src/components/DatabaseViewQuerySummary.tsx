import { Trans } from '@lingui/react/macro';
import type {
  DatabaseFilter,
  DatabaseQueryOperator,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { ArrowDownAZ, ArrowUpAZ, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDatabaseSelectProperty } from './database-table-types';

const FILTER_OPERATOR_LABELS: Record<DatabaseQueryOperator, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  does_not_contain: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: 'is one of',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
};

function compactFilterValue(value: string | number | boolean | string[] | number[] | boolean[]) {
  const text = Array.isArray(value)
    ? value.map((item) => String(item)).join(', ')
    : typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function propertyName(source: DatabaseSource, propertyId: string): string {
  return source.properties.find((property) => property.id === propertyId)?.name ?? propertyId;
}

/**
 * Select filters store the option's stable id. Showing that id verbatim leaves
 * the summary reading "Status is opt_35c9c65a…", so resolve it back to the
 * option name the user picked.
 */
function filterValueLabel(
  source: DatabaseSource,
  propertyId: string,
  value: string | number | boolean | string[] | number[] | boolean[],
): string | number | boolean | string[] | number[] | boolean[] {
  const property = source.properties.find((candidate) => candidate.id === propertyId);
  if (!property || !isDatabaseSelectProperty(property)) return value;
  const label = (item: string | number | boolean) =>
    property.options.find((option) => option.id === item)?.name ?? String(item);
  return Array.isArray(value) ? value.map((item) => label(item)) : label(value);
}

function filterSummaryNode(filter: DatabaseFilter, source: DatabaseSource): string {
  if ('and' in filter) {
    return filter.and.map((child) => filterSummaryNode(child, source)).join(' AND ');
  }
  if ('or' in filter) {
    return `(${filter.or.map((child) => filterSummaryNode(child, source)).join(' OR ')})`;
  }
  if ('not' in filter) return `NOT (${filterSummaryNode(filter.not, source)})`;
  const operator = FILTER_OPERATOR_LABELS[filter.operator];
  return 'value' in filter
    ? `${propertyName(source, filter.propertyId)} ${operator} ${compactFilterValue(
        filterValueLabel(source, filter.propertyId, filter.value),
      )}`
    : `${propertyName(source, filter.propertyId)} ${operator}`;
}

export function databaseFilterRuleCount(filter: DatabaseFilter): number {
  if ('and' in filter)
    return filter.and.reduce((count, child) => count + databaseFilterRuleCount(child), 0);
  if ('or' in filter)
    return filter.or.reduce((count, child) => count + databaseFilterRuleCount(child), 0);
  if ('not' in filter) return databaseFilterRuleCount(filter.not);
  return 1;
}

export function databaseFilterSummary(filter: DatabaseFilter, source: DatabaseSource): string {
  return filterSummaryNode(filter, source);
}

export function DatabaseViewQuerySummary({
  source,
  view,
  onOpenFilters,
  onOpenSorts,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  onOpenFilters: () => void;
  onOpenSorts: () => void;
}) {
  const filterText = view.where ? databaseFilterSummary(view.where, source) : null;
  const filterCount = view.where ? databaseFilterRuleCount(view.where) : 0;
  if (!filterText && view.sort.length === 0) return null;

  return (
    <div
      className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 overflow-x-auto text-xs"
      data-testid="database-query-summary"
      data-database-query-summary
      data-database-query-filter-count={filterCount || undefined}
      data-database-query-sort-count={view.sort.length || undefined}
    >
      <span className="shrink-0 text-muted-foreground">
        <Trans>Active query</Trans>
      </span>
      {filterText ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="max-w-full"
          title={`Filters: ${filterText}`}
          aria-label={`Filters: ${filterText}`}
          data-database-query-summary-filter
          onClick={onOpenFilters}
        >
          <Filter aria-hidden="true" />
          <span className="max-w-[min(70vw,36rem)] truncate">
            <span className="font-medium">Filter:</span> {filterText}
          </span>
        </Button>
      ) : null}
      {view.sort.map((item) => {
        const name = propertyName(source, item.propertyId);
        const direction = item.direction === 'asc' ? 'ascending' : 'descending';
        return (
          <Button
            key={item.propertyId}
            type="button"
            size="xs"
            variant="outline"
            title={`Sort by ${name} ${direction}`}
            aria-label={`Sort by ${name} ${direction}`}
            data-database-query-summary-sort
            data-database-query-sort-property-id={item.propertyId}
            onClick={onOpenSorts}
          >
            {item.direction === 'asc' ? (
              <ArrowUpAZ aria-hidden="true" />
            ) : (
              <ArrowDownAZ aria-hidden="true" />
            )}
            <span>
              <span className="font-medium">Sort:</span> {name}{' '}
              {item.direction === 'asc' ? '↑' : '↓'}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
