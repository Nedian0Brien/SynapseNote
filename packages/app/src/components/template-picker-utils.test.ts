/**
 * Pure-function unit tests for the template picker's sort order — the order
 * every "New from template" menu presents templates in.
 */

import { describe, expect, test } from 'bun:test';
import { sortTemplatesForPicker } from './template-picker-utils';

describe('sortTemplatesForPicker', () => {
  function entry(
    name: string,
    scope: 'local' | 'inherited',
    title?: string,
  ): {
    name: string;
    title?: string;
    description?: string;
    path: string;
    source_folder: string;
    scope: 'local' | 'inherited';
  } {
    return {
      name,
      ...(title === undefined ? {} : { title }),
      path: `${name}.md`,
      source_folder: '',
      scope,
    };
  }

  test('groups by scope: local → inherited', () => {
    const sorted = sortTemplatesForPicker([
      entry('beta-inherited', 'inherited'),
      entry('alpha-local', 'local'),
    ]);
    expect(sorted.map((t) => t.name)).toEqual(['alpha-local', 'beta-inherited']);
  });

  test('within scope, sorts by title (or name when title absent)', () => {
    const sorted = sortTemplatesForPicker([
      entry('zoo', 'local', 'Aardvark'),
      entry('apple', 'local'),
      entry('banana', 'local', 'Cherry'),
    ]);
    expect(sorted.map((t) => t.name)).toEqual(['zoo', 'apple', 'banana']);
  });

  test('returns a new array (does not mutate input)', () => {
    const input = [entry('b', 'local'), entry('a', 'local')];
    const sorted = sortTemplatesForPicker(input);
    expect(sorted).not.toBe(input);
    expect(input.map((t) => t.name)).toEqual(['b', 'a']);
  });

  test('handles empty list', () => {
    expect(sortTemplatesForPicker([])).toEqual([]);
  });

  test('mixed scopes interleaved are correctly grouped', () => {
    const sorted = sortTemplatesForPicker([
      entry('m-local', 'local'),
      entry('a-inherited', 'inherited'),
      entry('c-local', 'local'),
    ]);
    expect(sorted.map((t) => `${t.scope}:${t.name}`)).toEqual([
      'local:c-local',
      'local:m-local',
      'inherited:a-inherited',
    ]);
  });
});
