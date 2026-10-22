const PDF_READING_POSITION_KEY_PREFIX = 'ok-pdf-reading-position-v1:';

export interface PdfReadingPosition {
  pageNumber: number;
  pageOffsetY: number;
}

export interface PdfReadingPositionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryFallback = new Map<string, PdfReadingPosition>();

function storageKey(documentKey: string): string {
  return `${PDF_READING_POSITION_KEY_PREFIX}${encodeURIComponent(documentKey)}`;
}

function normalizePosition(value: unknown): PdfReadingPosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<PdfReadingPosition>;
  if (!Number.isInteger(candidate.pageNumber) || (candidate.pageNumber ?? 0) < 1) return null;
  if (!Number.isFinite(candidate.pageOffsetY) || (candidate.pageOffsetY ?? -1) < 0) return null;
  return {
    pageNumber: candidate.pageNumber as number,
    pageOffsetY: candidate.pageOffsetY as number,
  };
}

export function readPdfReadingPosition(
  documentKey: string,
  storage?: PdfReadingPositionStorage,
): PdfReadingPosition | null {
  if (documentKey === '') return null;
  const key = storageKey(documentKey);
  try {
    const source = storage ?? localStorage;
    const raw = source.getItem(key);
    if (raw === null) return null;
    return normalizePosition(JSON.parse(raw));
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

export function writePdfReadingPosition(
  documentKey: string,
  position: PdfReadingPosition,
  storage?: PdfReadingPositionStorage,
): void {
  if (documentKey === '') return;
  const normalized = normalizePosition(position);
  if (normalized === null) return;
  const key = storageKey(documentKey);
  memoryFallback.set(key, normalized);
  try {
    const target = storage ?? localStorage;
    target.setItem(key, JSON.stringify(normalized));
  } catch {
    // Restricted or full storage: retain the position for this renderer session.
  }
}
