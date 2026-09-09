/**
 * Sign-in prompt for a server running in remote mode.
 *
 * Renders its children until an `/api/*` call answers 401, then takes over the
 * viewport with a token form. Nothing here runs against a local server, which
 * never sends a 401 — so the desktop app and `bun run dev` mount this
 * component and never see it.
 *
 * Taking over rather than overlaying: once the server stops answering, every
 * pane behind this is showing stale or empty state, and letting the user click
 * around in it produces a stream of failures they cannot act on.
 */

import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { onApiUnauthorized, signIn } from '@/lib/auth-session';

function defaultReload(): void {
  window.location.reload();
}

type Status =
  | { kind: 'authorized' }
  | { kind: 'prompt' }
  | { kind: 'submitting' }
  | { kind: 'failed'; reason: 'rejected' | 'unavailable' | 'network' };

export interface SignInGateProps {
  readonly children: React.ReactNode;
  /**
   * How to restart the app once sign-in succeeds. Injected rather than called
   * inline so tests can observe it — `window.location.reload` is
   * non-configurable in the DOM implementation the test runner uses, and an
   * implicit environment effect is a test smell besides.
   */
  readonly reload?: () => void;
}

export function SignInGate({ children, reload = defaultReload }: SignInGateProps) {
  const [status, setStatus] = useState<Status>({ kind: 'authorized' });
  const [token, setToken] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useLingui();

  useEffect(
    () =>
      onApiUnauthorized(() => {
        // Ignore the signal while a submission is in flight: the request that
        // raced it is about to be answered by the one the user just made.
        setStatus((current) => (current.kind === 'submitting' ? current : { kind: 'prompt' }));
      }),
    [],
  );

  useEffect(() => {
    if (status.kind === 'prompt' || status.kind === 'failed') inputRef.current?.focus();
  }, [status.kind]);

  if (status.kind === 'authorized') return children;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    setStatus({ kind: 'submitting' });
    const result = await signIn(trimmed);
    if (!result.ok) {
      setStatus({ kind: 'failed', reason: result.reason });
      return;
    }
    // Reload rather than clearing the flag in place. Every pane behind this
    // gate fetched while unauthorized and is holding an error or an empty
    // result; a reload re-runs those fetches with the cookie attached instead
    // of asking each one to know how to recover.
    reload();
  }

  const message =
    status.kind === 'failed'
      ? status.reason === 'rejected'
        ? t`That token was not accepted. Check that it has not been revoked.`
        : status.reason === 'unavailable'
          ? t`This server is not asking for a token. Reload the page to continue.`
          : t`Could not reach the server. Check your connection and try again.`
      : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4"
        aria-labelledby="sign-in-heading"
      >
        <div className="space-y-1">
          <h1 id="sign-in-heading" className="font-semibold text-lg">
            <Trans>Sign in to SynapseNote</Trans>
          </h1>
          <p className="text-muted-foreground text-sm">
            <Trans>
              This workspace is served remotely and needs an access token. Create one on the server
              with <code className="font-mono">synapsenote access token create</code>.
            </Trans>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sign-in-token">
            <Trans>Access token</Trans>
          </Label>
          <Input
            id="sign-in-token"
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            placeholder="snote_"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={status.kind === 'submitting'}
            aria-invalid={status.kind === 'failed'}
            aria-describedby={message === null ? undefined : 'sign-in-error'}
          />
          {message !== null && (
            <p id="sign-in-error" role="alert" className="text-destructive text-sm">
              {message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={status.kind === 'submitting' || token.trim().length === 0}
        >
          {status.kind === 'submitting' ? <Trans>Signing in</Trans> : <Trans>Sign in</Trans>}
        </Button>
      </form>
    </div>
  );
}
