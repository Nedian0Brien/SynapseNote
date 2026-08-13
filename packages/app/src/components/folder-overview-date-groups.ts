import type { FolderOverviewEntry } from '@/components/folder-overview-data';

type FileEntry = Extract<FolderOverviewEntry, { kind: 'file' }>;

export type FolderDateGroup =
  | { key: 'past-7-days'; kind: 'past-7-days'; entries: FileEntry[] }
  | { key: 'past-30-days'; kind: 'past-30-days'; entries: FileEntry[] }
  | { key: `month:${string}`; kind: 'month'; month: Date; entries: FileEntry[] }
  | { key: 'undated'; kind: 'undated'; entries: FileEntry[] };

type FolderDateGroupDescriptor =
  | { key: 'past-7-days'; kind: 'past-7-days' }
  | { key: 'past-30-days'; kind: 'past-30-days' }
  | { key: `month:${string}`; kind: 'month'; month: Date }
  | { key: 'undated'; kind: 'undated' };

function dateGroupFor(iso: string, now: Date): FolderDateGroupDescriptor {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return { key: 'undated', kind: 'undated' };

  const elapsed = Math.max(0, now.getTime() - date.getTime());
  const elapsedDays = elapsed / 86_400_000;
  if (elapsedDays < 7) return { key: 'past-7-days', kind: 'past-7-days' };
  if (elapsedDays < 30) return { key: 'past-30-days', kind: 'past-30-days' };

  const month = new Date(date.getFullYear(), date.getMonth(), 1);
  return {
    key: `month:${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
    kind: 'month',
    month,
  };
}

/**
 * Craft separates its compact grid and list views into recency sections.
 * Entries retain the caller's order inside each section so the active sort
 * direction remains authoritative.
 */
export function groupFolderDocumentsByModified(
  entries: FileEntry[],
  now = new Date(),
): FolderDateGroup[] {
  const groups = new Map<string, FolderDateGroup>();
  for (const entry of entries) {
    const descriptor = dateGroupFor(entry.modified, now);
    const existing = groups.get(descriptor.key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    groups.set(descriptor.key, { ...descriptor, entries: [entry] } as FolderDateGroup);
  }
  return [...groups.values()];
}
