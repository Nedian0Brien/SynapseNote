import { describe, expect, test } from 'bun:test';
import { applyActions, initialState } from './edit.ts';
import { editFixtures, parseCursor } from './fixtures.ts';
import { computeLayout } from './layout.ts';

/** Screen position of a source offset: offsets separated only by hidden syntax are the same position. */
function screenPosition(source: string, offset: number): number {
  const hidden = new Uint8Array(source.length);
  for (const h of computeLayout(source).hidden) hidden.fill(1, h.from, h.to);
  let position = 0;
  for (let i = 0; i < offset; i++) if (!hidden[i]) position++;
  return position;
}

describe('applyActions — edit.json', () => {
  for (const fixture of editFixtures) {
    test(`${fixture.id} (${fixture.group})`, () => {
      const before = parseCursor(fixture.before);
      const result = applyActions(
        initialState(before.source, before.anchor, before.head),
        fixture.actions,
      );
      if (fixture.clipboard) expect(result.clipboard).toEqual(fixture.clipboard);
      if (fixture.ui) expect(result.ui).toBe(fixture.ui);
      if (fixture.after !== undefined) {
        const after = parseCursor(fixture.after);
        expect(result.source).toBe(after.source);
        if (after.anchor === after.head) {
          expect(result.anchor).toBe(result.head);
          expect(screenPosition(result.source, result.head)).toBe(
            screenPosition(after.source, after.head),
          );
        } else {
          expect([result.anchor, result.head]).toEqual([after.anchor, after.head]);
        }
      }
    });
  }
});
