import { folderDocumentCardHeight } from '@/components/folder-document-preview';

export const FOLDER_GALLERY_CARD_WIDTH = 176;
export const FOLDER_GALLERY_GAP = 12;

interface FolderGalleryEntry {
  path: string;
  size: number;
}

export interface FolderGalleryPlacement<Entry extends FolderGalleryEntry> {
  column: number;
  entry: Entry;
  height: number;
  top: number;
}

export function folderGalleryColumnCount(containerWidth: number, entryCount: number): number {
  if (entryCount <= 0) return 0;
  const availableWidth = Math.max(0, containerWidth);
  const columnsThatFit = Math.max(
    1,
    Math.floor(
      (availableWidth + FOLDER_GALLERY_GAP) / (FOLDER_GALLERY_CARD_WIDTH + FOLDER_GALLERY_GAP),
    ),
  );
  return Math.min(entryCount, columnsThatFit);
}

/**
 * Places the first row from left to right, then keeps the paper gallery dense
 * by sending each remaining card to the shortest column. Explicit grid rows
 * let the DOM retain document order, unlike CSS multi-column layout.
 */
export function placeFolderGalleryEntries<Entry extends FolderGalleryEntry>(
  entries: readonly Entry[],
  requestedColumnCount: number,
): FolderGalleryPlacement<Entry>[] {
  if (entries.length === 0) return [];
  const columnCount = Math.max(1, Math.min(entries.length, requestedColumnCount));
  const columnHeights = Array.from({ length: columnCount }, () => 0);

  return entries.map((entry, index) => {
    let column = index;
    if (index >= columnCount) {
      column = columnHeights.reduce(
        (shortest, height, candidate) => (height < columnHeights[shortest] ? candidate : shortest),
        0,
      );
    }

    const height = folderDocumentCardHeight(entry.size, entry.path);
    const top = columnHeights[column] ?? 0;
    columnHeights[column] = top + height + FOLDER_GALLERY_GAP;
    return { column, entry, height, top };
  });
}
