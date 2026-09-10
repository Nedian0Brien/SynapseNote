/**
 * Access mode, and the controls that read it.
 *
 * The rule these tests exist to hold: a wrong answer here hides or shows a
 * button, and nothing more. The server decides what is allowed — see
 * `api-sync-remote.test.ts` on the server side — so none of this is a security
 * boundary, and the default leans toward showing.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AccessModeProvider, useIsRemote } from '@/lib/access-mode';

let configBody: unknown = { collabUrl: null, previewUrl: null, port: 0, singleFile: false };
let configStatus = 200;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  configBody = { collabUrl: null, previewUrl: null, port: 0, singleFile: false };
  configStatus = 200;
  globalThis.fetch = mock(
    async () =>
      new Response(JSON.stringify(configBody), {
        status: configStatus,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  (window as { okDesktop?: unknown }).okDesktop = undefined;
});

function Probe() {
  return <span data-testid="mode">{useIsRemote() ? 'remote' : 'local'}</span>;
}

function renderProbe() {
  render(
    <AccessModeProvider>
      <Probe />
    </AccessModeProvider>,
  );
}

async function settledMode(): Promise<string> {
  await waitFor(() => expect(screen.getByTestId('mode')).toBeDefined());
  return screen.getByTestId('mode').textContent ?? '';
}

describe('what the shell decides it is', () => {
  test('remote when the server says so', async () => {
    configBody = { collabUrl: null, previewUrl: null, port: 0, accessMode: 'remote' };
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('remote'));
  });

  test('local when the server says so', async () => {
    configBody = { collabUrl: null, previewUrl: null, port: 0, accessMode: 'local' };
    renderProbe();
    expect(await settledMode()).toBe('local');
  });

  test('local when the server does not say', async () => {
    // An older server omits the field. Rendering the full desktop chrome is
    // what it has always done, and a control that then fails is recoverable —
    // a hidden one looks like a missing feature.
    configBody = { collabUrl: null, previewUrl: null, port: 0 };
    renderProbe();
    expect(await settledMode()).toBe('local');
  });

  test('local when the config call fails', async () => {
    configStatus = 500;
    renderProbe();
    expect(await settledMode()).toBe('local');
  });

  test('local when the value is something unexpected', async () => {
    configBody = { collabUrl: null, previewUrl: null, port: 0, accessMode: 'sideways' };
    renderProbe();
    expect(await settledMode()).toBe('local');
  });

  test('local on the desktop, with no request at all', async () => {
    // The renderer loads from file:// and `/api/config` is off-origin, so a
    // fetch here would fail and log noise. Desktop is local by construction.
    (window as { okDesktop?: unknown }).okDesktop = { config: {} };
    renderProbe();
    expect(await settledMode()).toBe('local');
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(
      0,
    );
  });

  test('local outside a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('mode').textContent).toBe('local');
  });
});
