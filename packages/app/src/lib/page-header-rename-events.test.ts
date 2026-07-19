import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { installDomGlobals } from '@/editor/walk-currency-test-harness';
import { requestPageHeaderRename, subscribeToPageHeaderRename } from './page-header-rename-events';

const cleanups: Array<() => void> = [];
let restoreDomGlobals: (() => void) | null = null;

beforeAll(() => {
  restoreDomGlobals = installDomGlobals();
});

afterAll(() => {
  restoreDomGlobals?.();
  restoreDomGlobals = null;
});

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe('page header rename events', () => {
  test('round-trips a handled rename result', async () => {
    cleanups.push(
      subscribeToPageHeaderRename(async (request) => {
        expect(request).toEqual({ docName: 'notes/old', docExt: '.mdx', nextTitle: 'new' });
        return { ok: true };
      }),
    );

    await expect(
      requestPageHeaderRename({ docName: 'notes/old', docExt: '.mdx', nextTitle: 'new' }),
    ).resolves.toEqual({ ok: true });
  });

  test('fails immediately when FileTree has no subscriber', async () => {
    await expect(
      requestPageHeaderRename({ docName: 'notes/old', docExt: '.md', nextTitle: 'new' }),
    ).resolves.toEqual({ ok: false, message: 'Rename is unavailable' });
  });
});
