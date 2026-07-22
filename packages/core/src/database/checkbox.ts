export type DatabaseCheckboxFormulaTarget = 'boolean' | 'number' | 'text';

/**
 * Canonical checkbox coercion contract reserved for the formula engine.
 * An absent optional checkbox behaves as unchecked; all other non-boolean
 * inputs are rejected instead of relying on JavaScript truthiness.
 */
export function coerceDatabaseCheckboxForFormula(
  value: boolean | undefined,
  target: DatabaseCheckboxFormulaTarget,
): boolean | number | string {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error('Checkbox formula input must be boolean or empty');
  }
  const checked = value ?? false;
  if (target === 'boolean') return checked;
  if (target === 'number') return checked ? 1 : 0;
  return checked ? 'true' : 'false';
}
