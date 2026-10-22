import { describe, expect, test } from 'bun:test';
import {
  type PdfReadingPositionStorage,
  readPdfReadingPosition,
  writePdfReadingPosition,
} from './pdf-reading-position-store';

function createStorage(): PdfReadingPositionStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('PDF reading position store', () => {
  test('round-trips a page and page-relative offset under the PDF identity', () => {
    const storage = createStorage();

    writePdfReadingPosition(
      'assets/reports/annual.pdf',
      { pageNumber: 12, pageOffsetY: 184.5 },
      storage,
    );

    expect(readPdfReadingPosition('assets/reports/annual.pdf', storage)).toEqual({
      pageNumber: 12,
      pageOffsetY: 184.5,
    });
    expect(readPdfReadingPosition('assets/reports/other.pdf', storage)).toBeNull();
  });

  test('rejects malformed or out-of-range persisted values', () => {
    const storage = createStorage();

    writePdfReadingPosition('report.pdf', { pageNumber: 2, pageOffsetY: 40 }, storage);
    const storedKey = [...storage.values.keys()][0];
    if (storedKey === undefined) throw new Error('Expected the test position to be stored');
    storage.values.set(storedKey, JSON.stringify({ pageNumber: 0, pageOffsetY: -4 }));

    expect(readPdfReadingPosition('report.pdf', storage)).toBeNull();
  });
});
