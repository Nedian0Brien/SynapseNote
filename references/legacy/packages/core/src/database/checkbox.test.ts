import { describe, expect, test } from 'bun:test';
import { coerceDatabaseCheckboxForFormula } from './checkbox.ts';

describe('Checkbox formula coercion', () => {
  test('coerces only canonical booleans and treats an empty optional value as unchecked', () => {
    expect(coerceDatabaseCheckboxForFormula(true, 'boolean')).toBe(true);
    expect(coerceDatabaseCheckboxForFormula(false, 'boolean')).toBe(false);
    expect(coerceDatabaseCheckboxForFormula(undefined, 'boolean')).toBe(false);
    expect(coerceDatabaseCheckboxForFormula(true, 'number')).toBe(1);
    expect(coerceDatabaseCheckboxForFormula(false, 'number')).toBe(0);
    expect(coerceDatabaseCheckboxForFormula(true, 'text')).toBe('true');
    expect(coerceDatabaseCheckboxForFormula(undefined, 'text')).toBe('false');
    expect(() => coerceDatabaseCheckboxForFormula('false' as never, 'boolean')).toThrow(
      'must be boolean or empty',
    );
  });
});
