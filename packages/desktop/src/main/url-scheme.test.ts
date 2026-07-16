import { describe, expect, test } from 'bun:test';
import { encodeShareUrl } from '@nedian0brien/synapsenote-core';
import { parseScreenUrl, parseShareUrl, parseSynapseNoteUrl } from './url-scheme.ts';

/**
 * Pure function — no
 * Electron bindings touched at module top, so Bun runs it directly.
 */

describe('parseSynapseNoteUrl — valid inputs', () => {
  test('parses well-formed open/project/doc URL', () => {
    const result = parseSynapseNoteUrl('synapsenote://open?project=/abs/path&doc=foo.md');
    expect(result).toEqual({
      host: 'open',
      project: '/abs/path',
      kind: 'doc',
      doc: 'foo.md',
    });
  });

  test('url-decodes project + doc before validation', () => {
    const result = parseSynapseNoteUrl(
      'synapsenote://open?project=%2Fabs%2Fmy%20path&doc=foo%20bar.md',
    );
    expect(result).toEqual({
      host: 'open',
      project: '/abs/my path',
      kind: 'doc',
      doc: 'foo bar.md',
    });
  });

  test('parses a folder= deep link with kind folder', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&folder=specs%2Ffoo')).toEqual({
      host: 'open',
      project: '/abs',
      kind: 'folder',
      doc: 'specs/foo',
    });
  });

  test('rejects when BOTH doc and folder are present (ambiguous)', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=a&folder=b')).toBeNull();
  });

  test('rejects when NEITHER doc nor folder is present', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs')).toBeNull();
  });

  test('applies the same traversal defense to folder= as doc=', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&folder=a%2F..%2Fb')).toBeNull();
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&folder=%2Fabs')).toBeNull();
  });

  test('accepts flat doc-name', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=a_b-c.md')).toMatchObject({
      doc: 'a_b-c.md',
    });
  });

  test('accepts nested doc-name (common MCP producer shape)', () => {
    // `preview-url.ts` (MCP) emits `doc=<encodeURIComponent(docName)>` where
    // docName is routinely nested — `notes/meeting`, `docs/a`, etc. The
    // parser MUST accept these or the entire MCP deep-link contract breaks.
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=docs%2Fa')).toMatchObject({
      doc: 'docs/a',
    });
  });

  test('accepts deeply nested doc-name', () => {
    expect(
      parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=deep%2Fnested%2Fpath%2Fhere.md'),
    ).toMatchObject({ doc: 'deep/nested/path/here.md' });
  });

  test('accepts unicode in nested doc-name', () => {
    expect(
      parseSynapseNoteUrl(
        'synapsenote://open?project=/abs&doc=notes%2F%E6%97%A5%E6%9C%AC%E8%AA%9E',
      ),
    ).toMatchObject({ doc: 'notes/日本語' });
  });
});

describe('parseSynapseNoteUrl — protocol + host validation', () => {
  test('rejects non-synapsenote protocol', () => {
    expect(parseSynapseNoteUrl('https://open?project=/abs/path&doc=foo.md')).toBeNull();
  });

  test('rejects unknown host (host !== "open")', () => {
    expect(parseSynapseNoteUrl('synapsenote://delete?project=/abs/path&doc=foo.md')).toBeNull();
  });

  test('rejects empty host', () => {
    // `synapsenote:` with no authority part — URL parser may treat as opaque.
    expect(parseSynapseNoteUrl('synapsenote:?project=/abs&doc=x')).toBeNull();
  });

  test('rejects obviously malformed URL', () => {
    expect(parseSynapseNoteUrl('not a url')).toBeNull();
  });

  test('rejects empty string', () => {
    expect(parseSynapseNoteUrl('')).toBeNull();
  });
});

describe('parseSynapseNoteUrl — required params', () => {
  test('rejects missing project', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?doc=foo.md')).toBeNull();
  });

  test('rejects missing doc', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs/path')).toBeNull();
  });

  test('rejects empty project', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=&doc=foo.md')).toBeNull();
  });

  test('rejects empty doc', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=')).toBeNull();
  });
});

describe('parseSynapseNoteUrl — null-byte defense', () => {
  test('rejects literal null byte in raw input', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs\x00&doc=x.md')).toBeNull();
  });

  test('rejects %00 in project', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=%00/safe/proj&doc=x.md')).toBeNull();
  });

  test('rejects %00 in doc', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=x%00.md')).toBeNull();
  });

  test('rejects double-encoded %2500 in project (layered null-byte smuggle)', () => {
    // URL.searchParams.get() decodes once ('%2500' → '%00'); decodeURIComponent
    // decodes again ('%00' → '\x00'). The post-decode null-byte recheck must
    // catch it — otherwise a layered encoding would bypass the raw-input gate.
    expect(parseSynapseNoteUrl('synapsenote://open?project=%2500/safe/proj&doc=x.md')).toBeNull();
  });

  test('rejects double-encoded %2500 in doc (layered null-byte smuggle)', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=x%2500.md')).toBeNull();
  });
});

describe('parseSynapseNoteUrl — path-traversal defense', () => {
  test('rejects literal ../ in project', () => {
    expect(
      parseSynapseNoteUrl('synapsenote://open?project=/abs/../etc/passwd&doc=x.md'),
    ).toBeNull();
  });

  test('rejects ../../ in project', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=../../etc/passwd&doc=x.md')).toBeNull();
  });

  test('rejects URL-encoded %2e%2e path traversal', () => {
    expect(
      parseSynapseNoteUrl('synapsenote://open?project=%2e%2e%2f%2e%2e%2fetc%2fpasswd&doc=x.md'),
    ).toBeNull();
  });

  test('rejects relative project path', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=relative/path&doc=x.md')).toBeNull();
  });

  test('rejects ".." as literal doc', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=..')).toBeNull();
  });

  test('rejects ".." segment inside nested doc (`a/../b`)', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=a%2F..%2Fb')).toBeNull();
  });

  test('rejects ".." at start of nested doc (`../foo`)', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=..%2Ffoo.md')).toBeNull();
  });

  test('rejects ".." at end of nested doc (`foo/..`)', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=foo%2F..')).toBeNull();
  });

  test('rejects leading slash in doc (absolute-path shape)', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=%2Ffoo.md')).toBeNull();
  });

  test('rejects backslash in doc (Windows-style separator)', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=sub\\foo.md')).toBeNull();
  });

  test('rejects URL-encoded backslash in nested doc', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=a%5Cb')).toBeNull();
  });

  test('rejects URL-encoded ../ prefix in doc', () => {
    expect(parseSynapseNoteUrl('synapsenote://open?project=/abs&doc=%2e%2e%2ffoo.md')).toBeNull();
  });
});

/**
 * Locks the producer/consumer contract with `packages/cli/src/mcp/tools/
 * preview-url.ts` — the MCP helper emits
 * `synapsenote://open?project=<encodeURIComponent(realpath)>&doc=<encodeURIComponent(docName)>`
 * for ANY docName (flat, nested, unicode). The parser MUST accept every
 * shape the producer emits, or deep-link routing silently fails for anything
 * other than project-root docs. If a change here breaks round-trip, the
 * MCP contract in preview-url.ts needs an accompanying breaking-change note.
 */
describe('parseSynapseNoteUrl — MCP producer/consumer round-trip', () => {
  function buildProducerUrl(project: string, docName: string): string {
    return `synapsenote://open?project=${encodeURIComponent(project)}&doc=${encodeURIComponent(docName)}`;
  }

  test.each([
    'README',
    'notes/meeting',
    'docs/a',
    'deeply/nested/path/here.md',
    'with spaces/in name',
    'unicode/日本語',
    'punct/foo - bar',
  ])('round-trips producer docName: %s', (docName: string) => {
    const url = buildProducerUrl('/abs/project', docName);
    const parsed = parseSynapseNoteUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed?.doc).toBe(docName);
    expect(parsed?.project).toBe('/abs/project');
  });

  test('producer-shape traversal attempts still rejected', () => {
    // The producer never emits these, but belt-and-suspenders: simulate a
    // malicious MCP client constructing the URL directly.
    expect(parseSynapseNoteUrl(buildProducerUrl('/abs', 'a/../b'))).toBeNull();
    expect(parseSynapseNoteUrl(buildProducerUrl('/abs', '../escape'))).toBeNull();
    expect(parseSynapseNoteUrl(buildProducerUrl('/abs', '/absolute'))).toBeNull();
  });
});

/**
 * `parseShareUrl` tests — share-flow URL decoder.
 *
 * Pairs with the encoder in `@nedian0brien/synapsenote-core` and the
 * blob-URL parser in `@nedian0brien/synapsenote`. Two input shapes:
 *
 *   - Universal Link: `https://synapse.lawdigest.kr/d/<base64url([0x01]||blob)>`
 *     (and `synapse.lawdigest.kr`) — version-byte-prefixed payload.
 *   - Custom scheme: `synapsenote://share?url=<urlencoded(<blob-url>)>` —
 *     URL carried directly (no version byte; immediate-handoff path).
 *
 * Both funnel through `parseGitHubBlobUrl` for shape validation; result is
 * `{kind: 'ok' | 'unsupported-version' | 'invalid', source, ...}` for share-
 * shaped inputs, or `null` for anything else (caller falls through to
 * `parseSynapseNoteUrl`).
 */
describe('parseShareUrl — universal-link happy path', () => {
  test('parses universal-link URL with main branch', () => {
    const encoded = encodeShareUrl('https://github.com/inkeep/playbooks/blob/main/marketing.md');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}`);
    expect(result).toEqual({
      kind: 'ok',
      source: 'universal-link',
      payload: {
        owner: 'inkeep',
        repo: 'playbooks',
        branch: 'main',
        sharedUrl: 'https://github.com/inkeep/playbooks/blob/main/marketing.md',
        target: { kind: 'doc', docPath: 'marketing.md' },
      },
    });
  });

  test('parses universal-link with www. subdomain (AASA dual-host parity)', () => {
    const encoded = encodeShareUrl('https://github.com/inkeep/playbooks/blob/main/x.md');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}`);
    expect(result?.kind).toBe('ok');
    expect(result?.source).toBe('universal-link');
  });

  test('parses universal-link with branch containing percent-encoded slash', () => {
    // Senders MUST percent-encode branch slashes per parseGitHubBlobUrl's
    // contract — the literal `/blob/feat/foo/file.md` form is ambiguous
    // without a network call. The pair (encoder builds sharedUrl with
    // %2F-encoded branch; decoder round-trips it) preserves the slash.
    const encoded = encodeShareUrl('https://github.com/o/r/blob/feat%2Ffoo/docs/sub/page.md');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}`);
    expect(result).toMatchObject({
      kind: 'ok',
      payload: { branch: 'feat/foo', target: { kind: 'doc', docPath: 'docs/sub/page.md' } },
    });
  });

  test('parses universal-link with unicode + spaces in path (per-segment encoded)', () => {
    const sharedUrl =
      'https://github.com/inkeep/playbooks/blob/main/docs/Q4%20OKRs%20%E2%80%94%20Marketing.md';
    const encoded = encodeShareUrl(sharedUrl);
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}`);
    expect(result).toMatchObject({
      kind: 'ok',
      payload: { target: { kind: 'doc', docPath: 'docs/Q4 OKRs — Marketing.md' } },
    });
  });
});

describe('parseShareUrl — universal-link extensibility (D30 Axis 1+2)', () => {
  test('tolerates unknown query parameters', () => {
    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    const result = parseShareUrl(
      `https://synapse.lawdigest.kr/d/${encoded}?utm_source=slack&ref=campaign`,
    );
    expect(result?.kind).toBe('ok');
  });

  test('tolerates a URL fragment', () => {
    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}#section-2`);
    expect(result?.kind).toBe('ok');
  });

  test('tolerates query + fragment together', () => {
    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    const result = parseShareUrl(
      `https://synapse.lawdigest.kr/d/${encoded}?utm_source=slack#section-2`,
    );
    expect(result?.kind).toBe('ok');
  });
});

describe('parseShareUrl — universal-link error states', () => {
  test('reports unsupported-version for v2 payload (0x02 byte)', () => {
    // Hand-build a v2 payload: [0x02] + utf-8 bytes of a valid blob URL.
    // Old desktops MUST surface "update" toast, not silent-mis-decode.
    const blobBytes = new TextEncoder().encode('https://github.com/o/r/blob/main/x.md');
    const payload = new Uint8Array(blobBytes.length + 1);
    payload[0] = 0x02;
    payload.set(blobBytes, 1);
    let b64 = '';
    for (const byte of payload) b64 += String.fromCharCode(byte);
    const encoded = btoa(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}`);
    expect(result).toEqual({
      kind: 'unsupported-version',
      source: 'universal-link',
      version: 2,
    });
  });

  test('reports invalid for corrupt base64url body', () => {
    const result = parseShareUrl('https://synapse.lawdigest.kr/d/!!!not-base64!!!');
    expect(result).toEqual({ kind: 'invalid', source: 'universal-link' });
  });

  test('reports invalid for empty encoded body', () => {
    const result = parseShareUrl('https://synapse.lawdigest.kr/d/');
    expect(result).toEqual({ kind: 'invalid', source: 'universal-link' });
  });

  test('reports invalid for non-github blob URL inside the payload', () => {
    const encoded = encodeShareUrl('https://gitlab.com/o/r/-/blob/main/x.md');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}`);
    expect(result).toEqual({ kind: 'invalid', source: 'universal-link' });
  });

  test('parses a github /tree/ URL as a folder target', () => {
    // A GitHub tree URL is a folder share — `parseGitHubShareUrl` resolves it
    // to a `folder` target whose `folderPath` is the directory path.
    const encoded = encodeShareUrl('https://github.com/inkeep/playbooks/tree/main/docs');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}`);
    expect(result).toMatchObject({
      kind: 'ok',
      source: 'universal-link',
      payload: {
        owner: 'inkeep',
        repo: 'playbooks',
        branch: 'main',
        target: { kind: 'folder', folderPath: 'docs' },
      },
    });
  });

  test('reports invalid for extra path segments after /d/<encoded>', () => {
    // Path-prefix evolution reserves `/s/`, `/p/`, etc. for future
    // share types. `/d/<encoded>/foo` is NOT a v1 share URL — caller must
    // see an invalid result, not silently take `<encoded>` and ignore the
    // tail.
    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    const result = parseShareUrl(`https://synapse.lawdigest.kr/d/${encoded}/extra`);
    expect(result).toEqual({ kind: 'invalid', source: 'universal-link' });
  });
});

describe('parseShareUrl — custom-scheme happy path', () => {
  test('parses synapsenote://share?url=<blob-url>', () => {
    const sharedUrl = 'https://github.com/inkeep/playbooks/blob/main/marketing.md';
    const result = parseShareUrl(`synapsenote://share?url=${encodeURIComponent(sharedUrl)}`);
    expect(result).toEqual({
      kind: 'ok',
      source: 'custom-scheme',
      payload: {
        owner: 'inkeep',
        repo: 'playbooks',
        branch: 'main',
        sharedUrl,
        target: { kind: 'doc', docPath: 'marketing.md' },
      },
    });
  });

  test('parses custom-scheme with percent-encoded slash in branch', () => {
    const sharedUrl = 'https://github.com/o/r/blob/feat%2Ffoo/docs/page.md';
    const result = parseShareUrl(`synapsenote://share?url=${encodeURIComponent(sharedUrl)}`);
    expect(result).toMatchObject({
      kind: 'ok',
      source: 'custom-scheme',
      payload: { branch: 'feat/foo', target: { kind: 'doc', docPath: 'docs/page.md' } },
    });
  });

  test('tolerates additional query params on custom-scheme path', () => {
    const sharedUrl = 'https://github.com/o/r/blob/main/x.md';
    const result = parseShareUrl(
      `synapsenote://share?url=${encodeURIComponent(sharedUrl)}&ref=campaign`,
    );
    expect(result?.kind).toBe('ok');
    expect(result?.source).toBe('custom-scheme');
  });
});

describe('parseShareUrl — custom-scheme error states', () => {
  test('reports invalid when url param is missing', () => {
    const result = parseShareUrl('synapsenote://share');
    expect(result).toEqual({ kind: 'invalid', source: 'custom-scheme' });
  });

  test('reports invalid when url param is empty', () => {
    const result = parseShareUrl('synapsenote://share?url=');
    expect(result).toEqual({ kind: 'invalid', source: 'custom-scheme' });
  });

  test('reports invalid for non-github URL', () => {
    const sharedUrl = 'https://gitlab.com/o/r/-/blob/main/x.md';
    const result = parseShareUrl(`synapsenote://share?url=${encodeURIComponent(sharedUrl)}`);
    expect(result).toEqual({ kind: 'invalid', source: 'custom-scheme' });
  });

  test('reports invalid for github URL that is neither a blob nor a tree URL', () => {
    const sharedUrl = 'https://github.com/o/r/pull/123';
    const result = parseShareUrl(`synapsenote://share?url=${encodeURIComponent(sharedUrl)}`);
    expect(result).toEqual({ kind: 'invalid', source: 'custom-scheme' });
  });

  test('parses a github /tree/ URL as a folder target (custom-scheme)', () => {
    const sharedUrl = 'https://github.com/o/r/tree/main/docs';
    const result = parseShareUrl(`synapsenote://share?url=${encodeURIComponent(sharedUrl)}`);
    expect(result).toMatchObject({
      kind: 'ok',
      source: 'custom-scheme',
      payload: {
        owner: 'o',
        repo: 'r',
        branch: 'main',
        target: { kind: 'folder', folderPath: 'docs' },
      },
    });
  });

  test('parses a github /tree/ root URL as a folder target with empty folderPath', () => {
    // `tree/<branch>` with no trailing path denotes the repo/branch root —
    // `parseGitHubShareUrl` yields `folderPath: ''`.
    const sharedUrl = 'https://github.com/o/r/tree/main';
    const result = parseShareUrl(`synapsenote://share?url=${encodeURIComponent(sharedUrl)}`);
    expect(result).toMatchObject({
      kind: 'ok',
      source: 'custom-scheme',
      payload: {
        owner: 'o',
        repo: 'r',
        branch: 'main',
        target: { kind: 'folder', folderPath: '' },
      },
    });
  });
});

describe('parseShareUrl — not-a-share-url (returns null, caller falls through)', () => {
  test('returns null for synapsenote://open?... (legacy open action)', () => {
    // Caller MUST be able to disambiguate: share-shaped → ShareParseResult,
    // open-shaped → falls through to parseSynapseNoteUrl. Returning null
    // here is the contract.
    const result = parseShareUrl('synapsenote://open?project=/abs&doc=x.md');
    expect(result).toBeNull();
  });

  test('returns null for synapsenote:// with unknown host (host !== share|open)', () => {
    expect(parseShareUrl('synapsenote://delete?url=x')).toBeNull();
  });

  test('returns null for plain HTTPS URL not on synapse.lawdigest.kr', () => {
    const result = parseShareUrl('https://example.com/d/abc');
    expect(result).toBeNull();
  });

  test('returns null for synapse.lawdigest.kr URL not under /d/', () => {
    expect(parseShareUrl('https://synapse.lawdigest.kr/docs/getting-started')).toBeNull();
    expect(parseShareUrl('https://synapse.lawdigest.kr/')).toBeNull();
    expect(parseShareUrl('https://synapse.lawdigest.kr')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(parseShareUrl('')).toBeNull();
  });

  test('returns null for malformed URL', () => {
    expect(parseShareUrl('not a url')).toBeNull();
  });

  test('returns null for null-byte smuggle attempts', () => {
    expect(parseShareUrl('https://synapse.lawdigest.kr/d/abc\x00')).toBeNull();
    expect(parseShareUrl('https://synapse.lawdigest.kr/d/abc%00def')).toBeNull();
  });
});

describe('parseScreenUrl', () => {
  test('parses the settings screen', () => {
    expect(parseScreenUrl('synapsenote://screen?name=settings')).toEqual({
      host: 'screen',
      name: 'settings',
    });
  });

  test('parses the install-claude screen', () => {
    expect(parseScreenUrl('synapsenote://screen?name=install-claude')).toEqual({
      host: 'screen',
      name: 'install-claude',
    });
  });

  test('URL-decodes the name param', () => {
    // %2D → '-', so the encoded form still resolves to install-claude.
    expect(parseScreenUrl('synapsenote://screen?name=install%2Dclaude')).toEqual({
      host: 'screen',
      name: 'install-claude',
    });
  });

  test('returns null for an unknown screen name', () => {
    expect(parseScreenUrl('synapsenote://screen?name=admin')).toBeNull();
    expect(parseScreenUrl('synapsenote://screen?name=')).toBeNull();
  });

  test('returns null when the name param is missing', () => {
    expect(parseScreenUrl('synapsenote://screen')).toBeNull();
  });

  test('returns null for the wrong host', () => {
    expect(parseScreenUrl('synapsenote://open?name=settings')).toBeNull();
    expect(parseScreenUrl('synapsenote://share?name=settings')).toBeNull();
  });

  test('returns null for the wrong protocol', () => {
    expect(parseScreenUrl('https://screen?name=settings')).toBeNull();
  });

  test('returns null for malformed / empty input', () => {
    expect(parseScreenUrl('not a url')).toBeNull();
    expect(parseScreenUrl('')).toBeNull();
  });

  test('returns null for null-byte smuggle attempts', () => {
    expect(parseScreenUrl('synapsenote://screen?name=sett\x00ings')).toBeNull();
    expect(parseScreenUrl('synapsenote://screen?name=settings%00')).toBeNull();
    // Double-encoded `%2500` decodes to `%00` past the raw-input guard; the
    // allowlist check then rejects the non-member name.
    expect(parseScreenUrl('synapsenote://screen?name=settings%2500')).toBeNull();
  });
});
