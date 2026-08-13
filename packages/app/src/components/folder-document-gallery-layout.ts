import { folderDocumentEstimatedCardHeight } from '@/components/folder-document-preview';

export const FOLDER_GALLERY_CARD_WIDTH = 240;
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
 * Assigns documents across columns from left to right, then starts again at
 * the leftmost column. Each column stacks independently, matching the visible
 * Craft ordering while keeping DOM and reading order identical.
 */
export function placeFolderGalleryEntries<Entry extends FolderGalleryEntry>(
  entries: readonly Entry[],
  requestedColumnCount: number,
  measuredHeights: ReadonlyMap<string, number> = new Map(),
): FolderGalleryPlacement<Entry>[] {
  if (entries.length === 0) return [];
  const columnCount = Math.max(1, Math.min(entries.length, requestedColumnCount));
  const columnHeights = Array.from({ length: columnCount }, () => 0);

  return entries.map((entry, index) => {
    const column = index % columnCount;
    const height = measuredHeights.get(entry.path) ?? folderDocumentEstimatedCardHeight(entry.size);
    const top = columnHeights[column] ?? 0;
    columnHeights[column] = top + height + FOLDER_GALLERY_GAP;
    return { column, entry, height, top };
  });
}
