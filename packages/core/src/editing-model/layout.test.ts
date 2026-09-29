import { describe, expect, test } from 'bun:test';
import { hideFixtures, parseMarked } from './fixtures.ts';
import { computeLayout } from './layout.ts';

describe('computeLayout — hide.json', () => {
  for (const fixture of hideFixtures) {
    test(`${fixture.id} (${fixture.group})`, () => {
      const expected = parseMarked(fixture.marked);
      const layout = computeLayout(expected.source);
      expect(layout.hidden.map((h) => [h.from, h.to])).toEqual(expected.hidden);
      expect(layout.widgets.map((w) => [w.from, w.to])).toEqual(expected.widgets);
    });
  }
});
