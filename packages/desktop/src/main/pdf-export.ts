import { basename } from 'node:path';

export type PdfExportResult =
  | { readonly ok: true; readonly canceled: true }
  | { readonly ok: true; readonly canceled: false; readonly path: string }
  | {
      readonly ok: false;
      readonly reason: 'print-failed' | 'write-failed' | 'invalid-pdf';
    };

interface PdfExportDeps {
  showSaveDialog: (options: {
    title: string;
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  printToPDF: (options: {
    printBackground: boolean;
    preferCSSPageSize: boolean;
    generateTaggedPDF: boolean;
    generateDocumentOutline: boolean;
  }) => Promise<Uint8Array>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

export function normalizeSuggestedPdfName(suggestedName: string): string {
  const safe = [...basename(suggestedName)]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(INVALID_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 180);
  const base = safe || 'Document';
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export async function exportWebContentsToPdf(
  deps: PdfExportDeps,
  suggestedName: string,
): Promise<PdfExportResult> {
  const picked = await deps.showSaveDialog({
    title: 'Export PDF',
    defaultPath: normalizeSuggestedPdfName(suggestedName),
    filters: [{ name: 'PDF document', extensions: ['pdf'] }],
  });
  if (picked.canceled || !picked.filePath) return { ok: true, canceled: true };

  let bytes: Uint8Array;
  try {
    bytes = await deps.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
    });
  } catch {
    return { ok: false, reason: 'print-failed' };
  }
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return { ok: false, reason: 'invalid-pdf' };
  }

  const outputPath = /\.pdf$/i.test(picked.filePath) ? picked.filePath : `${picked.filePath}.pdf`;
  try {
    await deps.writeFile(outputPath, bytes);
  } catch {
    return { ok: false, reason: 'write-failed' };
  }
  return { ok: true, canceled: false, path: outputPath };
}
