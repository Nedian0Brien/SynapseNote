import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function collectCatalogStrings(node: unknown, strings: Set<string>): void {
  if (typeof node === 'string') {
    strings.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectCatalogStrings(child, strings);
    return;
  }
  if (node && typeof node === 'object') {
    for (const child of Object.values(node)) collectCatalogStrings(child, strings);
  }
}

const catalogStrings = new Set<string>();

beforeAll(() => {
  const catalog = JSON.parse(
    readFileSync(join(import.meta.dir, '..', '..', 'locales', 'en', 'messages.json'), 'utf8'),
  ) as { messages: Record<string, unknown> };
  collectCatalogStrings(catalog.messages, catalogStrings);
});

describe('sent selection context translations', () => {
  for (const label of [
    '1 line selected',
    'Attached context: ',
    'Collapse attached context',
    'Expand attached context',
    'PDF selection',
    'Selection',
    'Selected passage',
    ' lines selected',
  ]) {
    test(`production catalog contains "${label}"`, () => {
      expect(catalogStrings.has(label)).toBe(true);
    });
  }
});
