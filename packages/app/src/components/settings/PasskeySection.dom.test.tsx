/**
 * Behavioral tests for Settings → Passkeys.
 *
 * The three transports are injected, so what is exercised is the section's own
 * decisions: when to render nothing at all, what a cancelled prompt looks like
 * versus a refused one, and that the list repaints from the server's answer
 * rather than from a local guess.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PasskeyListResult, PasskeyRegisterResult, PasskeySummary } from '@/lib/auth-login';
import { PasskeySection } from './PasskeySection';

afterEach(cleanup);

const macbook: PasskeySummary = {
  id: 'cred-1',
  label: 'MacBook',
  createdAt: '2026-09-01T10:00:00.000Z',
  lastUsedAt: '2026-09-08T09:00:00.000Z',
  backedUp: true,
};

interface Harness {
  list?: () => Promise<PasskeyListResult>;
  register?: (label: string) => Promise<PasskeyRegisterResult>;
  remove?: (id: string) => Promise<PasskeyListResult>;
  supported?: boolean;
}

function renderSection(opts: Harness = {}) {
  const registered: string[] = [];
  const removed: string[] = [];
  render(
    <PasskeySection
      list={opts.list ?? (async () => ({ ok: true, passkeys: [] }))}
      register={
        opts.register ??
        (async (label) => {
          registered.push(label);
          return { ok: true, passkeys: [macbook] };
        })
      }
      remove={
        opts.remove ??
        (async (id) => {
          removed.push(id);
          return { ok: true, passkeys: [] };
        })
      }
      supported={() => opts.supported ?? true}
    />,
  );
  return { registered, removed };
}

describe('when the server does not do logins', () => {
  test('renders nothing at all', async () => {
    // A local server answers 404. Offering to register a Touch ID passkey that
    // cannot work is worse than not offering.
    renderSection({ list: async () => ({ ok: false, reason: 'unavailable' }) });
    await waitFor(() => expect(screen.queryByTestId('settings-passkeys')).toBeNull());
  });
});

describe('the list', () => {
  test('shows the registered passkeys', async () => {
    renderSection({ list: async () => ({ ok: true, passkeys: [macbook] }) });
    expect(await screen.findByText('MacBook')).toBeDefined();
    expect(screen.getByText(/2026-09-01/)).toBeDefined();
  });

  test('says so when there are none', async () => {
    renderSection();
    expect(await screen.findByText(/no passkeys yet/i)).toBeDefined();
  });

  test('reports a list it could not read, and stays on screen', async () => {
    // Distinct from 404: this one might come back, so the section keeps the
    // register button rather than vanishing.
    renderSection({ list: async () => ({ ok: false, reason: 'network' }) });
    expect(await screen.findByText(/couldn't load your passkeys/i)).toBeDefined();
    expect(screen.getByTestId('settings-passkeys')).toBeDefined();
  });
});

describe('registering', () => {
  test('sends the typed label and repaints from the answer', async () => {
    const { registered } = renderSection();
    await screen.findByText(/no passkeys yet/i);
    fireEvent.change(screen.getByLabelText(/name this device/i), {
      target: { value: '  MacBook  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }));
    await waitFor(() => expect(registered).toEqual(['MacBook']));
    expect(await screen.findByText('MacBook')).toBeDefined();
  });

  test('clears the label field on success', async () => {
    renderSection();
    await screen.findByText(/no passkeys yet/i);
    const input = screen.getByLabelText(/name this device/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'MacBook' } });
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }));
    await waitFor(() => expect(input.value).toBe(''));
  });

  test('an empty label is allowed — the server names it', async () => {
    const { registered } = renderSection();
    await screen.findByText(/no passkeys yet/i);
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }));
    await waitFor(() => expect(registered).toEqual(['']));
  });

  test('a dismissed prompt shows no error', async () => {
    // The user changed their mind. An error for their own choice reads as a
    // broken feature.
    renderSection({ register: async () => ({ ok: false, reason: 'cancelled' }) });
    await screen.findByText(/no passkeys yet/i);
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add a passkey/i }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('an already-registered authenticator says so specifically', async () => {
    renderSection({ register: async () => ({ ok: false, reason: 'duplicate' }) });
    await screen.findByText(/no passkeys yet/i);
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already has a passkey/i);
  });

  test('any other failure explains itself', async () => {
    renderSection({ register: async () => ({ ok: false, reason: 'rejected' }) });
    await screen.findByText(/no passkeys yet/i);
    fireEvent.click(screen.getByRole('button', { name: /add a passkey/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not register/i);
  });
});

describe('removing', () => {
  test('sends the id and repaints from the answer', async () => {
    const { removed } = renderSection({ list: async () => ({ ok: true, passkeys: [macbook] }) });
    await screen.findByText('MacBook');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(removed).toEqual(['cred-1']));
    expect(await screen.findByText(/no passkeys yet/i)).toBeDefined();
  });

  test('a failed removal leaves the passkey listed', async () => {
    renderSection({
      list: async () => ({ ok: true, passkeys: [macbook] }),
      remove: async () => ({ ok: false, reason: 'network' }),
    });
    await screen.findByText('MacBook');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not remove/i);
    expect(screen.getByText('MacBook')).toBeDefined();
  });
});

describe('a browser without WebAuthn', () => {
  test('offers no way to register, but still lists and removes', async () => {
    renderSection({ supported: false, list: async () => ({ ok: true, passkeys: [macbook] }) });
    await screen.findByText('MacBook');
    expect(screen.queryByRole('button', { name: /add a passkey/i })).toBeNull();
    expect(screen.getByText(/cannot create passkeys/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined();
  });
});
