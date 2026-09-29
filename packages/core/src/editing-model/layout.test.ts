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

describe('computeLayout — ordered list numbers', () => {
  test('numbers follow the first item, not each item source number', () => {
    const labels = (source: string) =>
      computeLayout(source)
        .widgets.filter((w) => w.kind === 'list-marker')
        .map((w) => w.label ?? null);
    expect(labels('1. a\n1. b\n1. c')).toEqual(['1.', '2.', '3.']);
    expect(labels('3) a\n9) b')).toEqual(['3)', '4)']);
    expect(labels('- a\n- b')).toEqual([null, null]);
  });
});
