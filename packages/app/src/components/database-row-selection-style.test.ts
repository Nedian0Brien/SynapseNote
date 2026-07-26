import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadStyleManifest } from '../build/style-manifest';

const css = loadStyleManifest(join(__dirname, '..', 'globals.css')).css;

describe('database row selection control styles', () => {
  test('does not paint the generic JSX selection halo around database views', () => {
    expect(css).toMatch(
      /\.jsx-component-wrapper\[data-component-type="databaseview"\]::after\s*\{[^}]*display:\s*none;/,
    );
  });

  test('uses the inline cell boundary as the editing surface', () => {
    expect(css).toMatch(
      /\[data-database-inline-table\]\s+\[data-database-cell-editing="true"\]\s*\{[^}]*box-shadow:\s*inset\s+0\s+0\s+0\s+1px/,
    );
  });

  test('reveals the selection control as soon as its row interaction layer is active', () => {
    expect(css).toMatch(
      /\[data-database-table-interaction-layer\]\[data-state\]\s+\.ok-row-selection-btn\s*\{[^}]*opacity:\s*1;/,
    );
    expect(css).not.toMatch(
      /\[data-database-table-interaction-layer\]:not\(\[data-state="selected"\]\)[^{]*\{[^}]*opacity:\s*0;/,
    );
  });

  test('keeps an unselected checkbox empty while preserving its visible outline', () => {
    expect(css).toMatch(
      /\.ok-row-selection-btn\[data-state="unchecked"\]\s+svg\s*\{[^}]*opacity:\s*0;/,
    );
  });

  test('paints selected inline rows continuously and keeps persistent controls visible', () => {
    expect(css).toMatch(
      /\[data-database-inline-table\]\s+tbody\s+tr\[aria-selected="true"\]\s*>\s*td,/,
    );
    expect(css).toMatch(
      /\.ProseMirror\s+table\[data-database-inline-table\]\s+tbody\s+tr\[aria-selected="true"\]\s*>\s*td\[data-property-id\]:first-child\s*\{[^}]*background:\s*color-mix\([^;]+var\(--primary\)/,
    );
    expect(css).toMatch(/\.ok-row-selection-btn--persistent\s*\{[^}]*opacity:\s*1;/);
    expect(css).toMatch(
      /\[data-database-table-interaction-layer\]\[data-state="selected"\]\s+\.ok-row-selection-btn\s*\{[^}]*visibility:\s*hidden;/,
    );
  });
});
