/**
 * Behavioral tests for the remote-access sign-in gate.
 *
 * `fetch` is mocked at the system boundary; assertions are on what the user
 * sees and on the request the form actually sends. The post-sign-in restart
 * arrives as the component's injected `reload`, so a real page reload never
 * tears down the test DOM.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { notifyApiUnauthorized } from '@/lib/auth-session';

const { SignInGate } = await import('./SignInGate');

interface FetchCall {
  url: string;
  method: string | undefined;
  body: string | undefined;
}

let calls: FetchCall[] = [];
let reloads = 0;
let respond: () => Response;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  reloads = 0;
  respond = () => new Response(JSON.stringify({ label: 'laptop' }), { status: 200 });
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return respond();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function renderGate() {
  return render(
    <SignInGate
      reload={() => {
        reloads += 1;
      }}
    >
      <div data-testid="app">workspace</div>
    </SignInGate>,
  );
}

async function promptAppears() {
  act(() => notifyApiUnauthorized());
  await screen.findByRole('heading', { name: /sign in/i });
}

describe('SignInGate', () => {
  test('renders the app untouched until a 401 arrives', () => {
    // A local server never sends one, so this is the only state the desktop
    // app and `bun run dev` ever reach.
    renderGate();
    expect(screen.getByTestId('app')).toBeDefined();
    expect(screen.queryByLabelText(/access token/i)).toBeNull();
  });

  test('replaces the app with the token form on a 401', async () => {
    renderGate();
    await promptAppears();
    expect(screen.queryByTestId('app')).toBeNull();
    expect(screen.getByLabelText(/access token/i)).toBeDefined();
  });

  test('names the command that mints a token', async () => {
    renderGate();
    await promptAppears();
    expect(screen.getByText(/synapsenote access token create/i)).toBeDefined();
  });

  test('submits the token to the session endpoint', async () => {
    renderGate();
    await promptAppears();
    fireEvent.change(screen.getByLabelText(/access token/i), {
      target: { value: '  snote_abc  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]?.url).toBe('/api/auth/session');
    expect(calls[0]?.method).toBe('POST');
    // Trimmed — a token pasted with surrounding whitespace is the common case
    // and must not be sent as a different secret.
    expect(calls[0]?.body).toBe(JSON.stringify({ token: 'snote_abc' }));
  });

  test('reloads once the exchange succeeds', async () => {
    renderGate();
    await promptAppears();
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: 'snote_abc' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(reloads).toBe(1));
  });

  test('keeps the form up and explains a rejected token', async () => {
    respond = () => new Response('{}', { status: 401 });
    renderGate();
    await promptAppears();
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: 'snote_bad' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not accepted/i);
    expect(reloads).toBe(0);
  });

  test('distinguishes a server that is not asking for a token', async () => {
    // 404 means local mode. Saying "wrong token" would send the user hunting
    // for a better one when the server never asked for any.
    respond = () => new Response('', { status: 404 });
    renderGate();
    await promptAppears();
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: 'snote_abc' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not asking for a token/i);
  });

  test('explains a request that never completed', async () => {
    respond = () => {
      throw new Error('offline');
    };
    renderGate();
    await promptAppears();
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: 'snote_abc' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not reach the server/i);
  });

  test('will not submit an empty token', async () => {
    renderGate();
    await promptAppears();
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(calls.length).toBe(0);
  });

  test('marks the field invalid after a refusal', async () => {
    respond = () => new Response('{}', { status: 401 });
    renderGate();
    await promptAppears();
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: 'snote_bad' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/access token/i).getAttribute('aria-invalid')).toBe('true');
  });

  test('does not hide the token field behind a second 401 mid-submit', async () => {
    // A background request racing the submission must not reset the form the
    // user is waiting on.
    renderGate();
    await promptAppears();
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: 'snote_abc' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    act(() => notifyApiUnauthorized());
    await waitFor(() => expect(reloads).toBe(1));
  });
});
