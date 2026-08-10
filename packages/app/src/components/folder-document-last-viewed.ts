const STORAGE_KEY = 'synapsenote.folder-document-last-viewed.v1';

function readAll(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function readFolderDocumentLastViewed(path: string): string {
  const value = readAll()[path];
  return typeof value === 'string' ? value : '';
}

export function markFolderDocumentViewed(path: string, viewedAt = new Date()): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...readAll(), [path]: viewedAt.toISOString() }),
    );
  } catch {
    // Private browsing and locked-down webviews may reject localStorage.
  }
}
