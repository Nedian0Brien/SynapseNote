import { describe, expect, test } from 'bun:test';
import {
  codeWidgetSource,
  containerWidgetSource,
  diagramWidgetSource,
  mediaWidgetSource,
  tableWidgetSource,
  updateBlockWidget,
} from './block-widget.ts';
import { widgetFixtures } from './fixtures.ts';
import { computeLayout } from './layout.ts';
import { mdxWidgetSource } from './mdx-widget.ts';

describe('block widget source edits', () => {
  for (const fixture of widgetFixtures) {
    test(fixture.id, () => {
      const block = computeLayout(fixture.before).widgets.find(
        (widget) =>
          widget.from === fixture.from && (widget.kind === 'block' || widget.kind === 'inline'),
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

  test('diagram ranges use parsed formula and chart text', () => {
    const math = '$$\nx^2\n$$';
    const bracket = '\\[\nx^2\n\\]';
    const mermaid = '```mermaid\ngraph TD; A-->B\n```';
    expect(diagramWidgetSource(math, 0, math.length)).toEqual({
      kind: 'math',
      body: [3, 6],
      preview: 'x^2',
    });
    expect(diagramWidgetSource(bracket, 0, bracket.length)?.preview).toBe('x^2');
    expect(diagramWidgetSource(mermaid, 0, mermaid.length)?.preview).toBe('graph TD; A-->B');
  });

  test('container source maps only visible GFM body characters', () => {
    const source = '> [!NOTE] Title\n> body **bold**\n> next';
    const model = containerWidgetSource(source, 0, source.length);
    expect(model?.body).toBe('body **bold**\nnext');
    expect(model?.bodyBoundaries).toHaveLength((model?.body.length ?? 0) + 1);
    expect(model?.title).toBe('Title');
    expect(model?.calloutType).toBe('note');
  });

  test('media source distinguishes inline images, wiki files, and MDX embeds', () => {
    const image = '![Alt](./image.png)';
    const file = '![[report.pdf|Report]]';
    const embed = '<Embed src="https://example.com" />';
    expect(mediaWidgetSource(image, 0, image.length)?.kind).toBe('image');
    expect(mediaWidgetSource(file, 0, file.length)?.kind).toBe('file');
    expect(mediaWidgetSource(embed, 0, embed.length)?.kind).toBe('embed');
  });

  test('generic MDX passes JSON literals and leaves executable expressions inert', () => {
    const literal = '<DatabaseView viewOverrides={{"limit":10}} />';
    const expression = '<Custom onClick={() => alert(1)} title="Safe" />';
    expect(mdxWidgetSource(literal, 0, literal.length)?.props.viewOverrides).toEqual({ limit: 10 });
    expect(mdxWidgetSource(expression, 0, expression.length)?.props).toEqual({ title: 'Safe' });
  });
});
