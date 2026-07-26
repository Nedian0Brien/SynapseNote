import { describe, expect, mock, test } from 'bun:test';
import { exportWebContentsToPdf, normalizeSuggestedPdfName } from './pdf-export';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\nexample');

describe('PDF export', () => {
  test('normalizes renderer-provided suggested names', () => {
    expect(normalizeSuggestedPdfName('../Project: launch?.md')).toBe('Project- launch-.md.pdf');
    expect(normalizeSuggestedPdfName('notes.pdf')).toBe('notes.pdf');
    expect(normalizeSuggestedPdfName('')).toBe('Document.pdf');
  });

  test('prints with backgrounds and writes the selected file', async () => {
    const printToPDF = mock(async () => PDF_BYTES);
    const writeFile = mock(async () => undefined);
    const result = await exportWebContentsToPdf(
      {
        showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/launch' }),
        printToPDF,
        writeFile,
      },
      'launch.pdf',
    );

    expect(result).toEqual({ ok: true, canceled: false, path: '/tmp/launch.pdf' });
    expect(printToPDF).toHaveBeenCalledWith({
      printBackground: true,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
    });
    expect(writeFile).toHaveBeenCalledWith('/tmp/launch.pdf', PDF_BYTES);
  });

  test('does not print when the save dialog is canceled', async () => {
    const printToPDF = mock(async () => PDF_BYTES);
    const result = await exportWebContentsToPdf(
      {
        showSaveDialog: async () => ({ canceled: true }),
        printToPDF,
        writeFile: async () => undefined,
      },
      'launch.pdf',
    );

    expect(result).toEqual({ ok: true, canceled: true });
    expect(printToPDF).not.toHaveBeenCalled();
  });

  test('rejects a non-PDF print result before writing', async () => {
    const writeFile = mock(async () => undefined);
    const result = await exportWebContentsToPdf(
      {
        showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/launch.pdf' }),
        printToPDF: async () => new TextEncoder().encode('<html>'),
        writeFile,
      },
      'launch.pdf',
    );

    expect(result).toEqual({ ok: false, reason: 'invalid-pdf' });
    expect(writeFile).not.toHaveBeenCalled();
  });
});
