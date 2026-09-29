import { describe, expect, test } from 'bun:test';
import { codeWidgetSource, tableWidgetSource, updateBlockWidget } from './block-widget.ts';
import { widgetFixtures } from './fixtures.ts';
import { computeLayout } from './layout.ts';

describe('block widget source edits', () => {
  for (const fixture of widgetFixtures) {
    test(fixture.id, () => {
      const block = computeLayout(fixture.before).widgets.find(
        (widget) => widget.kind === 'block' && widget.from === fixture.from,
      );
      expect(block).toBeDefined();
      if (!block) throw new Error(`Missing widget for ${fixture.id}`);
      expect(updateBlockWidget(fixture.before, block.from, block.to, fixture.edit)).toBe(
        fixture.after,
      );
    });
  }

  test('table cell ranges retain escaped pipes, rich text, and surrounding padding', () => {
    const source = '| **a** | b\\|c |\n| :--- | ---: |\n|  | ~~x~~ |';
    const table = tableWidgetSource(source, 0, source.length);
    expect(table?.rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ['**a**', 'b\\|c'],
      ['', '~~x~~'],
    ]);
    expect(table?.rows[1]?.[0]?.from).toBe(table?.rows[1]?.[0]?.to);
  });

  test('code ranges exclude the fence and preserve metadata', () => {
    const source = '~~~ts title=x\na\n~~~';
    const code = codeWidgetSource(source, 0, source.length);
    expect(source.slice(...(code?.language ?? [0, 0]))).toBe('ts');
    expect(source.slice(...(code?.body ?? [0, 0]))).toBe('a');
  });
});
