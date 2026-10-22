export interface DatabaseUniqueIdPropertyState {
  id: string;
  prefix: string;
  nextNumber: number;
}

export interface DatabaseUniqueIdRecordState {
  id: string;
  values: Readonly<Record<string, unknown>>;
}

export interface DatabaseUniqueIdAssignment {
  recordId: string;
  propertyId: string;
  previous: unknown;
  number: number;
  formatted: string;
  reason: 'missing' | 'invalid' | 'duplicate';
}

export interface DatabaseUniqueIdRepairPlan {
  assignments: readonly DatabaseUniqueIdAssignment[];
  nextNumbers: Readonly<Record<string, number>>;
}

/** Render the user-facing value while keeping the mutable prefix out of records. */
export function formatDatabaseUniqueId(prefix: string, number: number): string {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('Unique ID numbers must be positive safe integers');
  }
  return prefix === '' ? String(number) : `${prefix}-${number}`;
}

/**
 * Produce a deterministic, non-reusing repair/allocation plan.
 *
 * Existing valid owners keep their number. Missing, invalid, and duplicate
 * values receive fresh numbers at or above both the persisted watermark and
 * every valid number currently present. Callers control allocation order.
 */
export function planDatabaseUniqueIdRepair(
  properties: readonly DatabaseUniqueIdPropertyState[],
  records: readonly DatabaseUniqueIdRecordState[],
): DatabaseUniqueIdRepairPlan {
  const assignments: DatabaseUniqueIdAssignment[] = [];
  const nextNumbers: Record<string, number> = {};

  for (const property of properties) {
    const validNumbers = records
      .map((record) => record.values[property.id])
      .filter((value): value is number => Number.isSafeInteger(value) && Number(value) >= 1);
    let nextNumber = Math.max(property.nextNumber, 1, ...validNumbers.map((value) => value + 1));
    const owners = new Set<number>();

    for (const record of records) {
      const previous = record.values[property.id];
      if (
        Number.isSafeInteger(previous) &&
        Number(previous) >= 1 &&
        !owners.has(Number(previous))
      ) {
        owners.add(Number(previous));
        continue;
      }
      const reason =
        previous === undefined
          ? 'missing'
          : Number.isSafeInteger(previous) && Number(previous) >= 1
            ? 'duplicate'
            : 'invalid';
      const number = nextNumber;
      nextNumber += 1;
      owners.add(number);
      assignments.push({
        recordId: record.id,
        propertyId: property.id,
        previous,
        number,
        formatted: formatDatabaseUniqueId(property.prefix, number),
        reason,
      });
    }
    nextNumbers[property.id] = nextNumber;
  }

  return { assignments, nextNumbers };
}
