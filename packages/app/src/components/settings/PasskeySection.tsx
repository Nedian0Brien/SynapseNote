/**
 * Settings → Account → Passkeys — register and remove the authenticators that
 * sign this browser in.
 *
 * Only meaningful on a server running in remote mode. Everywhere else the
 * endpoints answer 404, and the section renders nothing rather than an empty
 * list a local user can never fill: a desktop app that offers to register a
 * Touch ID passkey and then cannot is worse than no offer at all.
 */

import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  listPasskeys as defaultList,
  registerPasskey as defaultRegister,
  removePasskey as defaultRemove,
  supportsPasskeys as defaultSupports,
  type PasskeySummary,
} from '@/lib/auth-login';

type ListState =
  | { phase: 'loading' }
  | { phase: 'loaded'; passkeys: readonly PasskeySummary[] }
  /** The server does not do logins. The whole section stays hidden. */
  | { phase: 'absent' }
  | { phase: 'failed' };

export interface PasskeySectionProps {
  /** Injected for tests; production talks to `/api/auth/passkeys`. */
  readonly list?: typeof defaultList;
  readonly register?: typeof defaultRegister;
  readonly remove?: typeof defaultRemove;
  readonly supported?: () => boolean;
}

/** `2026-09-09`, or a dash when the value is missing or unparseable. */
function formatDate(iso: string | undefined): string {
  if (iso === undefined) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function PasskeySection({
  list = defaultList,
  register = defaultRegister,
  remove = defaultRemove,
  supported = defaultSupports,
}: PasskeySectionProps) {
  const { t } = useLingui();
  const [state, setState] = useState<ListState>({ phase: 'loading' });
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUsePasskeys] = useState(supported);

  useEffect(() => {
    let cancelled = false;
    void list().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ phase: 'loaded', passkeys: result.passkeys });
        return;
      }
      // A 404 means this server issues no logins at all; anything else means
      // the list could not be read and might come back on a retry.
      setState({ phase: result.reason === 'unavailable' ? 'absent' : 'failed' });
    });
    return () => {
      cancelled = true;
    };
  }, [list]);

  if (state.phase === 'absent') return null;

  async function handleRegister() {
    setBusy(true);
    setError(null);
    const result = await register(label.trim());
    setBusy(false);
    if (result.ok) {
      setState({ phase: 'loaded', passkeys: result.passkeys });
      setLabel('');
      return;
    }
    if (result.reason === 'cancelled') return;
    setError(
      result.reason === 'duplicate'
        ? t`This device already has a passkey for this workspace.`
        : result.reason === 'network'
          ? t`Could not reach the server. Check your connection and try again.`
          : t`Could not register that passkey.`,
    );
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setError(null);
    const result = await remove(id);
    setBusy(false);
    if (result.ok) {
      setState({ phase: 'loaded', passkeys: result.passkeys });
      return;
    }
    setError(t`Could not remove that passkey.`);
  }

  return (
    <section
      aria-labelledby="settings-passkeys-title"
      className="space-y-3"
      data-testid="settings-passkeys"
    >
      <div className="space-y-1">
        <h3 id="settings-passkeys-title" className="font-semibold text-base">
          <Trans>Passkeys</Trans>
        </h3>
        <p className="text-muted-foreground text-sm">
          <Trans>
            Sign in with Touch ID, Face ID, or a security key instead of typing your password.
          </Trans>
        </p>
      </div>

      {state.phase === 'loading' ? (
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
          <span className="sr-only">
            <Trans>Loading your passkeys</Trans>
          </span>
          <Skeleton className="h-9 w-full" />
        </div>
      ) : state.phase === 'failed' ? (
        <p role="status" className="text-muted-foreground text-sm">
          <Trans>We couldn't load your passkeys.</Trans>
        </p>
      ) : state.passkeys.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          <Trans>No passkeys yet.</Trans>
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {state.passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-sm">{passkey.label}</div>
                <div className="text-muted-foreground text-xs">
                  <Trans>
                    Added {formatDate(passkey.createdAt)} · Last used{' '}
                    {formatDate(passkey.lastUsedAt)}
                  </Trans>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void handleRemove(passkey.id)}
              >
                <Trans>Remove</Trans>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {canUsePasskeys ? (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="passkey-label">
              <Trans>Name this device</Trans>
            </Label>
            <Input
              id="passkey-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t`MacBook`}
              disabled={busy || state.phase === 'loading'}
            />
          </div>
          <Button
            disabled={busy || state.phase === 'loading'}
            onClick={() => void handleRegister()}
          >
            {busy ? <Trans>Waiting</Trans> : <Trans>Add a passkey</Trans>}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          <Trans>This browser cannot create passkeys. You can still remove existing ones.</Trans>
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
