import { describe, expect, test } from 'bun:test';
import {
  folderGalleryColumnCount,
  placeFolderGalleryEntries,
} from './folder-document-gallery-layout';

describe('folder document gallery layout', () => {
  test('uses the available horizontal space before stacking a small document set', () => {
    expect(folderGalleryColumnCount(176, 2)).toBe(1);
    expect(folderGalleryColumnCount(364, 2)).toBe(2);
    expect(folderGalleryColumnCount(1_200, 2)).toBe(2);

    const placements = placeFolderGalleryEntries(
      [
        { path: 'brain/log', size: 4_000 },
        { path: 'brain/memo', size: 200 },
      ],
      2,
    );

    expect(placements.map(({ column, top }) => ({ column, top }))).toEqual([
      { column: 0, top: 0 },
      { column: 1, top: 0 },
    ]);
  });

  test('keeps source order while placing later cards in the shortest column', () => {
    const entries = [
      { path: 'notes/large', size: 10_000 },
      { path: 'notes/small', size: 10 },
      { path: 'notes/next', size: 500 },
    ];
    const placements = placeFolderGalleryEntries(entries, 2);

    expect(placements.map(({ entry }) => entry.path)).toEqual(entries.map((entry) => entry.path));
    expect(placements[0]?.column).toBe(0);
    expect(placements[1]?.column).toBe(1);
    expect(placements[2]?.column).toBe(1);
    expect(placements[2]?.top).toBeGreaterThan(0);
  });
});
