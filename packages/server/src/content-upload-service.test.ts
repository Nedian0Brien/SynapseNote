import { describe, expect, test } from 'bun:test';
import { chooseUploadFilename } from './content-upload-service.ts';

describe('content upload service seam', () => {
  test('uses the detected extension for a generic clipboard filename', () => {
    expect(
      chooseUploadFilename({
        filename: 'image.png',
        detectedExt: 'webp',
        now: new Date('2026-08-02T03:04:05.000Z'),
      }),
    ).toBe('pasted-20260802-030405.webp');
  });
});
