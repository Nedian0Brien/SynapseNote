import { describe, expect, test } from 'bun:test';
import { findNativeHighlightElement } from './memo-highlights';

describe('native highlight navigation', () => {
  test.skipIf(typeof document === 'undefined')(
    'finds the mark whose ProseMirror range overlaps the sidebar annotation',
    () => {
      const root = document.createElement('div');
      root.innerHTML =
        '<p><mark data-from="2" data-to="7">first</mark> gap <mark data-from="12" data-to="18">second</mark></p>';
      const mark = findNativeHighlightElement(root, { from: 12, to: 18 }, (node, offset) => {
        const element = node as HTMLElement;
        return Number(element.dataset[offset === 0 ? 'from' : 'to']);
      });

      expect(mark?.textContent).toBe('second');
    },
  );
});
