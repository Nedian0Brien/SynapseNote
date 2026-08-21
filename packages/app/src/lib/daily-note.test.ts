import { describe, expect, mock, test } from 'bun:test';
import { dailyNoteDocName, formatLocalDailyNoteDate, openOrCreateDailyNote } from './daily-note';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('daily note paths', () => {
  test('uses local calendar parts and the canonical daily folder', () => {
    const localDate = new Date(2026, 0, 9, 23, 30);
    expect(formatLocalDailyNoteDate(localDate)).toBe('2026-01-09');
    expect(dailyNoteDocName(localDate)).toBe('daily/2026-01-09');
  });
});

describe('openOrCreateDailyNote', () => {
  test('creates from the daily template with the browser-local date override', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      if (String(input).startsWith('/api/folder-config')) {
        return jsonResponse({ folder: { templates_available: [{ name: 'daily' }] } });
      }
      return jsonResponse({ docName: 'daily/2026-08-21' });
    }) as typeof fetch;

    await expect(openOrCreateDailyNote(new Date(2026, 7, 21, 8), fetchImpl)).resolves.toEqual({
      docName: 'daily/2026-08-21',
      created: true,
    });

    const createBody = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
    expect(createBody).toEqual({
      path: 'daily/2026-08-21.md',
      template: 'daily',
      templateDate: '2026-08-21',
    });
  });

  test('creates a blank note when no daily template resolves', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      if (String(input).startsWith('/api/folder-config')) {
        return jsonResponse({ folder: { templates_available: [] } });
      }
      return jsonResponse({ docName: 'daily/2026-08-21' });
    }) as typeof fetch;

    await openOrCreateDailyNote(new Date(2026, 7, 21), fetchImpl);

    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      path: 'daily/2026-08-21.md',
    });
  });

  test('opens the existing note when creation loses the atomic create race', async () => {
    const fetchImpl = mock(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/folder-config')) return jsonResponse({}, 404);
      return jsonResponse(
        { type: 'urn:ok:error:doc-already-exists', title: 'File already exists.' },
        409,
      );
    }) as typeof fetch;

    await expect(openOrCreateDailyNote(new Date(2026, 7, 21), fetchImpl)).resolves.toEqual({
      docName: 'daily/2026-08-21',
      created: false,
    });
  });

  test('retries without a template when the discovered template disappears', async () => {
    let createCalls = 0;
    const bodies: unknown[] = [];
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith('/api/folder-config')) {
        return jsonResponse({ folder: { templates_available: [{ name: 'daily' }] } });
      }
      createCalls += 1;
      bodies.push(JSON.parse(String(init?.body)));
      return createCalls === 1
        ? jsonResponse({ title: 'Template no longer resolves.' }, 400)
        : jsonResponse({ docName: 'daily/2026-08-21' });
    }) as typeof fetch;

    await expect(openOrCreateDailyNote(new Date(2026, 7, 21), fetchImpl)).resolves.toEqual({
      docName: 'daily/2026-08-21',
      created: true,
    });
    expect(bodies).toEqual([
      {
        path: 'daily/2026-08-21.md',
        template: 'daily',
        templateDate: '2026-08-21',
      },
      { path: 'daily/2026-08-21.md' },
    ]);
  });

  test('surfaces non-conflict create failures', async () => {
    const fetchImpl = mock(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/folder-config')) return jsonResponse({}, 404);
      return jsonResponse({ title: 'Disk is read-only.' }, 500);
    }) as typeof fetch;

    await expect(openOrCreateDailyNote(new Date(2026, 7, 21), fetchImpl)).rejects.toThrow(
      'Disk is read-only.',
    );
  });
});
