import type { DatabaseConditionalColorRule, DatabaseSource } from '@nedian0brien/synapsenote-core';

export function conditionalColorSummary(
  rule: DatabaseConditionalColorRule,
  source: DatabaseSource,
): string {
  const summarize = (filter: DatabaseConditionalColorRule['where']): string => {
    if ('and' in filter) return `AND(${filter.and.map(summarize).join(', ')})`;
    if ('or' in filter) return `OR(${filter.or.map(summarize).join(', ')})`;
    if ('not' in filter) return `NOT(${summarize(filter.not)})`;
    const property = source.properties.find((candidate) => candidate.id === filter.propertyId);
    return `${property?.name ?? filter.propertyId} ${filter.operator}${'value' in filter ? ` ${JSON.stringify(filter.value)}` : ''}`;
  };
  return summarize(rule.where);
}

export function move<T>(values: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= values.length) return [...values];
  const next = [...values];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

export function moveVisibleProperty(
  values: readonly string[],
  visiblePropertyIds: readonly string[],
  propertyId: string,
  direction: -1 | 1,
): string[] {
  const visibleOrder = values.filter((candidate) => visiblePropertyIds.includes(candidate));
  const visibleFrom = visibleOrder.indexOf(propertyId);
  const visibleTo = visibleFrom + direction;
  if (visibleFrom <= 0 || visibleTo <= 0 || visibleTo >= visibleOrder.length) return [...values];
  const targetPropertyId = visibleOrder[visibleTo];
  const from = values.indexOf(propertyId);
  const to = targetPropertyId ? values.indexOf(targetPropertyId) : -1;
  if (from < 0 || to < 0) return [...values];
  const next = [...values];
  const [moved] = next.splice(from, 1);
  if (!moved) return next;
  next.splice(to, 0, moved);
  return next;
}
