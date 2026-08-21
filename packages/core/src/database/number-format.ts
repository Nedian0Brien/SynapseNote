import type { DatabaseNumberVisualization, DatabaseProperty } from './schema.ts';

export const DEFAULT_DATABASE_NUMBER_VISUALIZATION = {
  style: 'number',
  color: 'green',
  denominator: 100,
  showValue: true,
} as const satisfies DatabaseNumberVisualization;

export function databaseNumberVisualization(
  property: Extract<DatabaseProperty, { type: 'number' }>,
): DatabaseNumberVisualization {
  return property.visualization ?? DEFAULT_DATABASE_NUMBER_VISUALIZATION;
}

export function databaseNumberVisualizationProgress(value: number, denominator: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.min(1, Math.max(0, value / denominator));
}

function option<T>(options: Record<string, unknown>, key: string): T | undefined {
  return options[key] as T | undefined;
}

/**
 * Formats a canonical finite number without changing its stored value. Callers
 * choose the locale; query comparison and serialization remain locale-neutral.
 */
export function formatDatabaseNumber(
  value: number,
  property: Extract<DatabaseProperty, { type: 'number' }>,
  locales?: Intl.LocalesArgument,
): string {
  if (!Number.isFinite(value)) throw new Error('Database numbers must be finite');
  const format = property.semantics?.format;
  if (!format) return new Intl.NumberFormat(locales, { useGrouping: false }).format(value);
  const options = format.options;
  const common: Intl.NumberFormatOptions = {
    ...(typeof options.minimumFractionDigits === 'number'
      ? { minimumFractionDigits: options.minimumFractionDigits }
      : {}),
    ...(typeof options.maximumFractionDigits === 'number'
      ? { maximumFractionDigits: options.maximumFractionDigits }
      : {}),
    ...(typeof options.useGrouping === 'boolean' ? { useGrouping: options.useGrouping } : {}),
    ...(typeof options.signDisplay === 'string'
      ? { signDisplay: options.signDisplay as Intl.NumberFormatOptions['signDisplay'] }
      : {}),
  };
  if (format.style === 'currency') {
    return new Intl.NumberFormat(locales, {
      ...common,
      style: 'currency',
      currency: option<string>(options, 'currency'),
      currencyDisplay: option<Intl.NumberFormatOptions['currencyDisplay']>(
        options,
        'currencyDisplay',
      ),
    }).format(value);
  }
  if (format.style === 'percent') {
    return new Intl.NumberFormat(locales, { ...common, style: 'percent' }).format(value);
  }
  if (format.style === 'unit') {
    return new Intl.NumberFormat(locales, {
      ...common,
      style: 'unit',
      unit: option<string>(options, 'unit'),
      unitDisplay: option<Intl.NumberFormatOptions['unitDisplay']>(options, 'unitDisplay'),
    }).format(value);
  }
  if (format.style === 'custom') {
    const multiplier = option<number>(options, 'multiplier') ?? 1;
    const formatted = new Intl.NumberFormat(locales, common).format(value * multiplier);
    return `${option<string>(options, 'prefix') ?? ''}${formatted}${option<string>(options, 'suffix') ?? ''}`;
  }
  return new Intl.NumberFormat(locales, common).format(value);
}
