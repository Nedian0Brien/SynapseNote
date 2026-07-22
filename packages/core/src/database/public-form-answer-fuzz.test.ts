import { describe, expect, test } from 'bun:test';
import type { DatabaseProperty } from './schema.ts';
import { isDatabaseValueValidForProperty, validateDatabasePropertyConstraints } from './schema.ts';

/**
 * Bounded, seeded fuzz corpus for public Form answer validation (R-007).
 * `isDatabaseValueValidForProperty` and `validateDatabasePropertyConstraints`
 * are the shared boundary `DatabaseDataPlane#submitForm` runs every
 * unauthenticated form answer through before it can touch a record — the
 * highest-value fuzz target for "public forms" since it is reachable by
 * anonymous input. Neither function is documented to throw for arbitrary
 * `value`; this corpus is reproducible evidence that they don't, across
 * every property type that accepts direct answers.
 */

const ITERATIONS = 256;

function unit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

function integer(seed: number, salt: number, maximum: number): number {
  return Math.floor(unit(seed, salt) * maximum);
}

const PROPERTIES: DatabaseProperty[] = [
  { id: 'prop_text', key: 'text', name: 'Text', type: 'text' },
  {
    id: 'prop_bounded_text',
    key: 'bounded_text',
    name: 'Bounded text',
    type: 'text',
    semantics: {
      constraints: { unique: false, maxLength: 5, pattern: '^[a-z]*$' },
      inferencePolicy: 'explicit_only',
      sensitivity: 'inherit',
    },
  },
  { id: 'prop_number', key: 'number', name: 'Number', type: 'number' },
  {
    id: 'prop_bounded_number',
    key: 'bounded_number',
    name: 'Bounded number',
    type: 'number',
    semantics: {
      constraints: { unique: false, min: 0, max: 10 },
      inferencePolicy: 'explicit_only',
      sensitivity: 'inherit',
    },
  },
  { id: 'prop_checkbox', key: 'checkbox', name: 'Checkbox', type: 'checkbox' },
  { id: 'prop_url', key: 'url', name: 'URL', type: 'url' },
  { id: 'prop_email', key: 'email', name: 'Email', type: 'email' },
  { id: 'prop_phone', key: 'phone', name: 'Phone', type: 'phone' },
  { id: 'prop_date', key: 'date', name: 'Date', type: 'date' },
  {
    id: 'prop_select',
    key: 'select',
    name: 'Select',
    type: 'select',
    options: [
      { id: 'opt_open', key: 'open', name: 'Open' },
      { id: 'opt_archived', key: 'archived', name: 'Archived', archived: true },
    ],
  },
  {
    id: 'prop_multi_select',
    key: 'multi_select',
    name: 'Multi-select',
    type: 'multi_select',
    options: [
      { id: 'opt_red', key: 'red', name: 'Red' },
      { id: 'opt_blue', key: 'blue', name: 'Blue' },
    ],
  },
  { id: 'prop_files', key: 'files', name: 'Files', type: 'files' },
  {
    id: 'prop_place',
    key: 'place',
    name: 'Place',
    type: 'place',
    externalSearch: 'disabled',
    externalMap: 'disabled',
  },
] as DatabaseProperty[];

const VALUE_GENERATORS: Array<(seed: number) => unknown> = [
  (seed) => `answer ${seed}`,
  (seed) => integer(seed, 90, 1_000_000) - 500_000,
  () => Number.NaN,
  () => Number.POSITIVE_INFINITY,
  () => Number.NEGATIVE_INFINITY,
  () => true,
  () => false,
  () => null,
  () => undefined,
  () => [],
  () => ({}),
  (seed) => Array.from({ length: 1 + integer(seed, 91, 20) }, (_, index) => `item_${index}`),
  () => 'opt_open',
  () => 'opt_archived',
  () => ['opt_red', 'opt_blue', 'opt_red'],
  () => '__proto__',
  () => ({ __proto__: { polluted: true } }),
  (seed) => '행 😀 مرحبا'.repeat(1 + integer(seed, 92, 50)),
  (seed) => 'x'.repeat(integer(seed, 93, 20_000)),
  () => '2026-07-21',
  () => 'not-a-date',
  () => 'https://example.com',
  () => 'javascript:alert(1)',
  () => 'not an email',
  () => [{ id: 'file_1', name: 'a.txt', kind: 'local' }],
  () => ({ lat: 0, lon: 0 }),
  (seed) => integer(seed, 94, 2),
];

function generatedValue(seed: number, salt: number): unknown {
  const generator = VALUE_GENERATORS[integer(seed, salt, VALUE_GENERATORS.length)];
  return generator ? generator(seed) : undefined;
}

describe('public Form answer validation fuzz corpus', () => {
  test('never throws for generated adversarial answers across every answerable property type', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      for (const [propertyIndex, property] of PROPERTIES.entries()) {
        const value = generatedValue(seed, 10 + propertyIndex);
        const label = `seed ${seed} property ${property.key} value ${JSON.stringify(value)}`;
        let valid: boolean;
        try {
          valid = isDatabaseValueValidForProperty(property, value);
        } catch (cause) {
          throw new Error(`${label}: isDatabaseValueValidForProperty threw: ${String(cause)}`, {
            cause,
          });
        }
        expect(typeof valid, label).toBe('boolean');
        let constraintIssue: string | null;
        try {
          constraintIssue = validateDatabasePropertyConstraints(property, value);
        } catch (cause) {
          throw new Error(`${label}: validateDatabasePropertyConstraints threw: ${String(cause)}`, {
            cause,
          });
        }
        expect(constraintIssue === null || typeof constraintIssue === 'string', label).toBe(true);
      }
    }
  });

  test('rejects an archived Select option and a duplicated multi-select entry', () => {
    const select = PROPERTIES.find((property) => property.key === 'select') as Extract<
      DatabaseProperty,
      { type: 'select' }
    >;
    expect(isDatabaseValueValidForProperty(select, 'opt_archived')).toBe(false);
    const multiSelect = PROPERTIES.find((property) => property.key === 'multi_select') as Extract<
      DatabaseProperty,
      { type: 'multi_select' }
    >;
    expect(isDatabaseValueValidForProperty(multiSelect, ['opt_red', 'opt_red'])).toBe(false);
  });

  test('enforces bounded text length/pattern and bounded number range without throwing on an invalid regex fallback', () => {
    const boundedText = PROPERTIES.find((property) => property.key === 'bounded_text') as Extract<
      DatabaseProperty,
      { type: 'text' }
    >;
    expect(validateDatabasePropertyConstraints(boundedText, 'toolong')).toContain('at most 5');
    expect(validateDatabasePropertyConstraints(boundedText, 'UPPER')).toContain('must match');
    expect(validateDatabasePropertyConstraints(boundedText, 'ok')).toBeNull();

    const invalidPatternProperty = {
      ...boundedText,
      semantics: {
        ...boundedText.semantics,
        constraints: { ...boundedText.semantics.constraints, pattern: '(unterminated' },
      },
    };
    expect(() => validateDatabasePropertyConstraints(invalidPatternProperty, 'ok')).not.toThrow();
    expect(validateDatabasePropertyConstraints(invalidPatternProperty, 'ok')).toBe(
      'uses an invalid pattern constraint',
    );

    const boundedNumber = PROPERTIES.find(
      (property) => property.key === 'bounded_number',
    ) as Extract<DatabaseProperty, { type: 'number' }>;
    expect(validateDatabasePropertyConstraints(boundedNumber, -1)).toContain('at least 0');
    expect(validateDatabasePropertyConstraints(boundedNumber, 11)).toContain('at most 10');
    expect(validateDatabasePropertyConstraints(boundedNumber, 5)).toBeNull();
  });
});
