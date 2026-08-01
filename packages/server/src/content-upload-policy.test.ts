import { describe, expect, test } from 'bun:test';
import { resolveUploadDestDir, sanitizeFilename } from './content-upload-policy.ts';

describe('content upload policy seam', () => {
  test('keeps unicode names portable without allowing hidden or oversized basenames', () => {
    expect(sanitizeFilename('../회의 🎉.png')).toBe('회의 🎉.png');
    expect(sanitizeFilename(`x.${'a'.repeat(300)}`)).toBe('upload');
  });

  test('resolves a current-folder attachment path from the parent document', () => {
    expect(resolveUploadDestDir('notes/daily/today.md', './assets', '/vault')).toBe(
      '/vault/notes/daily/assets',
    );
  });
});
