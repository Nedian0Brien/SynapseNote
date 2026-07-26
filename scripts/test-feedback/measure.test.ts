import { describe, expect, test } from 'bun:test';

import { parseJUnit, percentile } from './measure.ts';

describe('JUnit measurement parser', () => {
  test('computes a deterministic percentile for baseline samples', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20);
    expect(percentile([], 0.95)).toBe(0);
  });

  test('reads both self-closing and body-bearing testcase elements', () => {
    const cases = parseJUnit(`
      <testsuite>
        <testcase classname="unit" name="fast" time="0.012" />
        <testcase classname="process" name="fails" file="server.test.ts" time="1.5">
          <failure message="boom">stack</failure>
        </testcase>
        <testcase classname="unit" name="skipped" time="0">
          <skipped />
        </testcase>
      </testsuite>
    `);

    expect(cases).toEqual([
      { classname: 'unit', name: 'fast', durationMs: 12 },
      {
        classname: 'process',
        name: 'fails',
        file: 'server.test.ts',
        durationMs: 1500,
        failure: '<failure message="boom">stack</failure>',
      },
      { classname: 'unit', name: 'skipped', durationMs: 0, skipped: true },
    ]);
  });
});
