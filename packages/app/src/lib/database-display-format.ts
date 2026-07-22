import { i18n } from '@/lib/i18n';

export type DatabaseDisplayLocale = string | string[] | undefined;

function activeLocale(locale?: DatabaseDisplayLocale): DatabaseDisplayLocale {
  return locale ?? i18n.locale ?? undefined;
}

/** Display-only formatters. Canonical database values and query ordering never use these. */
export function formatDatabaseNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: DatabaseDisplayLocale,
): string {
  return new Intl.NumberFormat(activeLocale(locale), options).format(value);
}

export function formatDatabaseCurrency(
  value: number,
  currency: string,
  locale?: DatabaseDisplayLocale,
): string {
  return formatDatabaseNumber(value, { style: 'currency', currency }, locale);
}

export function formatDatabaseDateTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  locale?: DatabaseDisplayLocale,
): string {
  return new Intl.DateTimeFormat(activeLocale(locale), options).format(new Date(value));
}

export function formatDatabaseRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale?: DatabaseDisplayLocale,
): string {
  return new Intl.RelativeTimeFormat(activeLocale(locale), { numeric: 'auto' }).format(value, unit);
}

/** Locale-aware display ordering only; canonical query sort remains locale-neutral in core. */
export function compareDatabaseDisplayLabels(
  left: string,
  right: string,
  locale?: DatabaseDisplayLocale,
): number {
  return new Intl.Collator(activeLocale(locale), { numeric: true, sensitivity: 'base' }).compare(
    left,
    right,
  );
}
