/**
 * Behavioral tests for the remote-access sign-in gate.
 *
 * `fetch` is mocked at the system boundary; assertions are on what the user
 * sees and on the request the form actually sends. The post-sign-in restart
 * arrives as the component's injected `reload`, so a real page reload never
 * tears down the test DOM.
 *
 * The passkey path stops at `@simplewebauthn/browser`, which needs a real
 * authenticator. It is mocked here; the ceremony itself is proved on the
 * server and, end to end, by a human with a fingerprint.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { notifyApiUnauthorized } from '@/lib/auth-session';

let startAuthenticationImpl: () => Promise<unknown> = async () => ({ id: 'cred-1' });

mock.module('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: () => startAuthenticationImpl(),
  startRegistration: async () => ({ id: 'cred-1' }),
}));

const { SignInGate } = await import('./SignInGate');

interface FetchCall {
  url: string;
  method: string | undefined;
  body: string | undefined;
}

let calls: FetchCall[] = [];
let reloads = 0;
let respond: (url: string) => Response;

const originalFetch = globalThis.fetch;

function ok(body: unknown = { label: 'libera3920' }): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

beforeEach(() => {
  calls = [];
  reloads = 0;
  startAuthenticationImpl = async () => ({ id: 'cred-1' });
  respond = () => ok();
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return respond(url);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function renderGate(opts: { passkeys?: boolean } = {}) {
  return render(
    <SignInGate
      reload={() => {
        reloads += 1;
      }}
      passkeysSupported={() => opts.passkeys ?? true}
    >
      <div data-testid="app">workspace</div>
    </SignInGate>,
  );
}

async function promptAppears() {
  act(() => notifyApiUnauthorized());
  await screen.findByRole('heading', { name: /sign in/i });
}

function fillPassword(username = 'libera3920', password = 'correct horse battery staple') {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
}

function submitButton() {
  return screen.getByRole('button', { name: /^sign in$/i });
}

describe('what the gate shows', () => {
  test('renders the app untouched until a 401 arrives', () => {
    // A local server never sends one, so this is the only state the desktop
    // app and `bun run dev` ever reach.
    renderGate();
    expect(screen.getByTestId('app')).toBeDefined();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  test('replaces the app with the sign-in form on a 401', async () => {
    renderGate();
    await promptAppears();
    expect(screen.queryByTestId('app')).toBeNull();
    expect(screen.getByLabelText(/username/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  test('offers no access-token field', async () => {
    // Pasting a token into a browser is what this replaced. Tokens remain for
    // MCP clients and the CLI, which send them as `Authorization: Bearer`.
    renderGate();
    await promptAppears();
    expect(screen.queryByLabelText(/access token/i)).toBeNull();
    expect(screen.queryByText(/access token create/i)).toBeNull();
  });

  test('names the command that creates an account', async () => {
    // R29: a deployment can have tokens and no account. Someone looking at
    // this screen with nothing to type needs to know that.
    renderGate();
    await promptAppears();
    expect(screen.getByText(/access account create/i)).toBeDefined();
  });

  test('offers the passkey button where the browser supports it', async () => {
    renderGate({ passkeys: true });
    await promptAppears();
    expect(screen.getByRole('button', { name: /passkey/i })).toBeDefined();
  });

  test('hides it where the browser does not, keeping the password form', async () => {
    renderGate({ passkeys: false });
    await promptAppears();
    expect(screen.queryByRole('button', { name: /passkey/i })).toBeNull();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });
});

describe('signing in with a password', () => {
  test('posts the username and password', async () => {
    renderGate();
    await promptAppears();
    fillPassword('  libera3920  ');
    fireEvent.click(submitButton());
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]?.url).toBe('/api/auth/password');
    expect(calls[0]?.method).toBe('POST');
    // The username is trimmed — a trailing space from an autofill must not
    // read as a different account. The password is not: a space may be part
    // of it.
    expect(calls[0]?.body).toBe(
      JSON.stringify({ username: 'libera3920', password: 'correct horse battery staple' }),
    );
  });

  test('reloads once it succeeds', async () => {
    renderGate();
    await promptAppears();
    fillPassword();
    fireEvent.click(submitButton());
    await waitFor(() => expect(reloads).toBe(1));
  });

  test('keeps the form up and explains a refusal', async () => {
    respond = () => new Response('{}', { status: 401 });
    renderGate();
    await promptAppears();
    fillPassword();
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not accepted/i);
    expect(reloads).toBe(0);
  });

  test('reports how long a locked account has to wait', async () => {
    respond = () => new Response('{}', { status: 429, headers: { 'Retry-After': '900' } });
    renderGate();
    await promptAppears();
    fillPassword();
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/900/);
  });

  test('distinguishes a server that is not asking for a sign-in', async () => {
    // 404 means local mode. Saying "wrong password" would send the user
    // hunting for a better one when the server never asked for any.
    respond = () => new Response('', { status: 404 });
    renderGate();
    await promptAppears();
    fillPassword();
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not asking you to sign in/i);
  });

  test('explains a request that never completed', async () => {
    respond = () => {
      throw new Error('offline');
    };
    renderGate();
    await promptAppears();
    fillPassword();
    fireEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not reach the server/i);
  });

  test('will not submit with either field empty', async () => {
    renderGate();
    await promptAppears();
    expect(submitButton().hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'libera3920' } });
    expect(submitButton().hasAttribute('disabled')).toBe(true);
    fireEvent.click(submitButton());
    expect(calls.length).toBe(0);
  });

  test('marks the fields invalid after a refusal', async () => {
    respond = () => new Response('{}', { status: 401 });
    renderGate();
    await promptAppears();
    fillPassword();
    fireEvent.click(submitButton());
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/password/i).getAttribute('aria-invalid')).toBe('true');
  });

  test('a second 401 mid-submit does not reset the form', async () => {
    // A background request racing the submission must not wipe what the user
    // is waiting on.
    renderGate();
    await promptAppears();
    fillPassword();
    fireEvent.click(submitButton());
    act(() => notifyApiUnauthorized());
    await waitFor(() => expect(reloads).toBe(1));
  });
});

describe('signing in with a passkey', () => {
  test('runs the ceremony and reloads', async () => {
    respond = (url) =>
      url.endsWith('/options') ? ok({ challengeHandle: 'h1', options: {} }) : ok();
    renderGate();
    await promptAppears();
    fireEvent.click(screen.getByRole('button', { name: /passkey/i }));
    await waitFor(() => expect(reloads).toBe(1));
    expect(calls.map((c) => c.url)).toEqual([
      '/api/auth/passkey/authenticate/options',
      '/api/auth/passkey/authenticate/verify',
    ]);
    expect(calls[1]?.body).toBe(
      JSON.stringify({ challengeHandle: 'h1', response: { id: 'cred-1' } }),
    );
  });

  test('a dismissed prompt returns to the form without an error', async () => {
    // The user changed their mind. Showing them a refusal for their own
    // choice would read as a broken passkey.
    respond = () => ok({ challengeHandle: 'h1', options: {} });
    startAuthenticationImpl = async () => {
      throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
    };
    renderGate();
    await promptAppears();
    fireEvent.click(screen.getByRole('button', { name: /passkey/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(reloads).toBe(0);
  });

  test('a refused assertion explains itself and leaves the password form', async () => {
    respond = (url) =>
      url.endsWith('/options')
        ? ok({ challengeHandle: 'h1', options: {} })
        : new Response('{}', { status: 401 });
    renderGate();
    await promptAppears();
    fireEvent.click(screen.getByRole('button', { name: /passkey/i }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(reloads).toBe(0);
  });
});
