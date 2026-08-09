import { useLayoutEffect, useRef, useState } from 'react';
import { FolderDocumentCard } from '@/components/FolderDocumentCard';
import {
  FOLDER_GALLERY_CARD_WIDTH,
  FOLDER_GALLERY_GAP,
  folderGalleryColumnCount,
  placeFolderGalleryEntries,
} from '@/components/folder-document-gallery-layout';
import type { FolderOverviewEntry } from '@/components/folder-overview-data';

type FileEntry = Extract<FolderOverviewEntry, { kind: 'file' }>;

export function FolderDocumentGallery({
  ariaLabel,
  entries,
}: {
  ariaLabel: string;
  entries: FileEntry[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    function update(width: number) {
      if (width <= 0) return;
      const next = folderGalleryColumnCount(width, entries.length);
      setColumnCount((current) => (current === next ? current : next));
    }

    update(section.getBoundingClientRect().width || section.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      update(entry?.contentRect.width ?? section.clientWidth);
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [entries.length]);

  const effectiveColumnCount = Math.max(1, Math.min(entries.length, columnCount));
  const placements = placeFolderGalleryEntries(entries, effectiveColumnCount);
  const galleryWidth =
    effectiveColumnCount * FOLDER_GALLERY_CARD_WIDTH +
    Math.max(0, effectiveColumnCount - 1) * FOLDER_GALLERY_GAP;

  return (
    <section ref={sectionRef} aria-label={ariaLabel} data-folder-document-gallery>
      <div
        className="grid w-full"
        data-folder-gallery-columns={effectiveColumnCount}
        style={{
          columnGap: FOLDER_GALLERY_GAP,
          gridAutoRows: '1px',
          gridTemplateColumns: `repeat(${effectiveColumnCount}, minmax(0, 1fr))`,
          maxWidth: galleryWidth,
        }}
      >
        {placements.map(({ column, entry, height, top }) => (
          <div
            key={entry.path}
            className="min-w-0"
            data-folder-gallery-column={column}
            style={{
              gridColumn: column + 1,
              gridRow: `${top + 1} / span ${height + FOLDER_GALLERY_GAP}`,
            }}
          >
            <FolderDocumentCard entry={entry} mode="preview" />
          </div>
        ))}
      </div>
    </section>
  );
}
