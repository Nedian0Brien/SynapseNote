import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import {
  editFixtures,
  hideFixtures,
  parseCursor,
  parseMarked,
  widgetFixtures,
} from './fixtures.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });
const spec = readFileSync(join(import.meta.dir, 'SPEC.md'), 'utf8');
/** Fixture ids the spec cites, e.g. `(edit.enter-list, edit.enter-list-empty)`; `x.y-*` is a prefix. */
const specIds = [
  ...new Set(
    [...spec.matchAll(/\b((?:hide|edit|widget)\.(?!json\b)[a-z0-9-]+\*?)/g)].map((m) => m[1]),
  ),
];
const all = [...hideFixtures, ...editFixtures, ...widgetFixtures];

describe('editing-model fixtures', () => {
  test('ids are unique', () => {
    const ids = all.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every fixture group is cited by the spec', () => {
    const cited = (group: string) =>
      specIds.some((id) => (id.endsWith('*') ? group.startsWith(id.slice(0, -1)) : id === group));
    expect(all.map((f) => f.group).filter((g) => !cited(g))).toEqual([]);
  });

  test('every spec id has a fixture', () => {
    const covered = (id: string) =>
      all.some((f) => (id.endsWith('*') ? f.group.startsWith(id.slice(0, -1)) : f.group === id));
    expect(specIds.filter((id) => !covered(id))).toEqual([]);
  });

  test('every fixture names a spec section', () => {
    for (const f of all) expect(spec).toContain(`## ${f.rule}.`);
  });

  test('hide fixtures have balanced markers and parse', () => {
    for (const f of hideFixtures) {
      const { source } = parseMarked(f.marked);
      expect(() => md.parse(source)).not.toThrow();
    }
  });

  test('edit fixtures have one cursor or selection and parse', () => {
    for (const f of editFixtures) {
      expect(f.actions.length).toBeGreaterThan(0);
      expect(f.after !== undefined || f.clipboard !== undefined).toBe(true);
      const before = parseCursor(f.before);
      expect(() => md.parse(before.source)).not.toThrow();
      if (f.after !== undefined) expect(() => md.parse(parseCursor(f.after).source)).not.toThrow();
    }
  });

  test('widget fixtures point to parsed blocks', () => {
    for (const f of widgetFixtures) {
      const block = md
        .parseToMdast(f.before)
        .children.find((node) => node.position?.start.offset === f.from);
      expect(block).toBeDefined();
    }
  });

  test('marker parsing', () => {
    expect(parseMarked('a ⟨**⟩b⟨**⟩ ⦃- ⦄c')).toEqual({
      source: 'a **b** - c',
      hidden: [
        [2, 4],
        [5, 7],
      ],
      widgets: [[8, 10]],
      visible: 'a b ￼c',
    });
    expect(parseCursor('a⟪bc⟫d')).toEqual({ source: 'abcd', anchor: 1, head: 3 });
    expect(parseCursor('ab│')).toEqual({ source: 'ab', anchor: 2, head: 2 });
  });
});
