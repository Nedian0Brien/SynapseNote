import { describe, expect, test } from 'bun:test';
import { buildIngestBody } from './ingest-body.ts';

describe('buildIngestBody', () => {
  test('shell-quotes curl protocol allowlists for zsh', () => {
    const body = buildIngestBody('https://example.com/source', '.');

    expect(body).not.toContain('--proto =http,=https');
    expect(body).not.toContain('--proto-redir =http,=https');
    expect(body.match(/--proto '=http,https'/g)).toHaveLength(3);
    expect(body.match(/--proto-redir '=http,https'/g)).toHaveLength(3);
  });
});
