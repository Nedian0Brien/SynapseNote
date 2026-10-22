import { describe, expect, test } from 'bun:test';
import { CHAT_HASH, docNameFromHash, isChatHash } from './doc-hash';

describe('main chat route', () => {
  test('recognizes the singleton route without treating it as a document', () => {
    expect(isChatHash(CHAT_HASH)).toBe(true);
    expect(isChatHash(`${CHAT_HASH}/`)).toBe(true);
    expect(isChatHash('#/__chat__/extra')).toBe(false);
    expect(docNameFromHash(CHAT_HASH)).toBeNull();
    expect(docNameFromHash(`${CHAT_HASH}/`)).toBeNull();
  });
});
