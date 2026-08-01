import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

test('api-extension source contains no literal NUL bytes', () => {
  const source = readFileSync(new URL('./api-extension.ts', import.meta.url));

  expect(source.includes(0)).toBe(false);
});
