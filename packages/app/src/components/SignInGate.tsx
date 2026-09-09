/**
 * Sign-in prompt for a server running in remote mode.
 *
 * Renders its children until an `/api/*` call answers 401, then takes over the
 * viewport. Nothing here runs against a local server, which never sends a 401
 * — so the desktop app and `bun run dev` mount this component and never see
 * it.
 *
 * Taking over rather than overlaying: once the server stops answering, every
 * pane behind this is showing stale or empty state, and letting the user click
 * around in it produces a stream of failures they cannot act on.
 *
 * Two ways in. The passkey button comes first where the browser supports it,
 * because that is the path with nothing to type and nothing to remember, but
 * the password form is always present — a passkey can fail for reasons the
 * user cannot fix from here (a different device, a cleared authenticator), and
 * a sign-in screen with no way forward is a locked door.
 */

import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type LoginResult,
  signInWithPasskey,
  signInWithPassword,
  supportsPasskeys,
} from '@/lib/auth-login';
import { onApiUnauthorized } from '@/lib/auth-session';

function defaultReload(): void {
  window.location.reload();
}

type Failure = Extract<LoginResult, { ok: false }>;

type Status =
  | { kind: 'authorized' }
  | { kind: 'prompt' }
  | { kind: 'submitting'; method: 'password' | 'passkey' }
  | { kind: 'failed'; failure: Failure };

export interface SignInGateProps {
  readonly children: React.ReactNode;
  /**
   * How to restart the app once sign-in succeeds. Injected rather than called
   * inline so tests can observe it — `window.location.reload` is
   * non-configurable in the DOM implementation the test runner uses, and an
   * implicit environment effect is a test smell besides.
   */
  readonly reload?: () => void;
  /** Whether to offer the passkey button. Injected for tests. */
  readonly passkeysSupported?: () => boolean;
}

export function SignInGate({
  children,
  reload = defaultReload,
  passkeysSupported = supportsPasskeys,
}: SignInGateProps) {
  const [status, setStatus] = useState<Status>({ kind: 'authorized' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);
  const { t } = useLingui();
  // Read once: capability does not change while the page is open, and calling
  // it during render would re-run it on every keystroke.
  const [canUsePasskeys] = useState(passkeysSupported);

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
    if (status.kind === 'prompt') usernameRef.current?.focus();
  }, [status.kind]);

  if (status.kind === 'authorized') return children;

  const busy = status.kind === 'submitting';

  function finish(result: LoginResult): void {
    if (!result.ok) {
      setStatus({ kind: 'failed', failure: result });
      return;
    }
    // Reload rather than clearing the flag in place. Every pane behind this
    // gate fetched while unauthorized and is holding an error or an empty
    // result; a reload re-runs those fetches with the cookie attached instead
    // of asking each one to know how to recover.
    reload();
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (username.trim().length === 0 || password.length === 0) return;
    setStatus({ kind: 'submitting', method: 'password' });
    finish(await signInWithPassword(username.trim(), password));
  }

  async function submitPasskey() {
    setStatus({ kind: 'submitting', method: 'passkey' });
    const result = await signInWithPasskey();
    // A dismissed authenticator sheet is not a refusal — the user changed
    // their mind. Put them back on the form rather than showing an error for
    // something they chose.
    if (!result.ok && result.reason === 'cancelled') {
      setStatus({ kind: 'prompt' });
      return;
    }
    finish(result);
  }

  const message =
    status.kind === 'failed'
      ? describeFailure(status.failure, {
          rejected: t`That username and password were not accepted.`,
          unavailable: t`This server is not asking you to sign in. Reload the page to continue.`,
          network: t`Could not reach the server. Check your connection and try again.`,
          locked: (seconds: number) =>
            t`Too many failed attempts. Try again in ${seconds} seconds.`,
        })
      : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1">
          <h1 id="sign-in-heading" className="font-semibold text-lg">
            <Trans>Sign in to SynapseNote</Trans>
          </h1>
          <p className="text-muted-foreground text-sm">
            <Trans>This workspace is served remotely.</Trans>
          </p>
        </div>

        {canUsePasskeys && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={submitPasskey}
              disabled={busy}
            >
              {status.kind === 'submitting' && status.method === 'passkey' ? (
                <Trans>Waiting for your passkey</Trans>
              ) : (
                <Trans>Sign in with a passkey</Trans>
              )}
            </Button>
            <div className="flex items-center gap-3 text-muted-foreground text-xs">
              <span className="h-px flex-1 bg-border" />
              <Trans>or</Trans>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <form onSubmit={submitPassword} className="space-y-4" aria-labelledby="sign-in-heading">
          <div className="space-y-2">
            <Label htmlFor="sign-in-username">
              <Trans>Username</Trans>
            </Label>
            <Input
              id="sign-in-username"
              ref={usernameRef}
              type="text"
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={busy}
              aria-invalid={status.kind === 'failed'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sign-in-password">
              <Trans>Password</Trans>
            </Label>
            <Input
              id="sign-in-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
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
            disabled={busy || username.trim().length === 0 || password.length === 0}
          >
            {status.kind === 'submitting' && status.method === 'password' ? (
              <Trans>Signing in</Trans>
            ) : (
              <Trans>Sign in</Trans>
            )}
          </Button>
        </form>

        <p className="text-muted-foreground text-xs">
          <Trans>
            No account yet? Create one on the server with{' '}
            <code className="font-mono">synapsenote access account create</code>.
          </Trans>
        </p>
      </div>
    </div>
  );
}

/** Map a failure onto the sentence the user reads. */
function describeFailure(
  failure: Failure,
  messages: {
    rejected: string;
    unavailable: string;
    network: string;
    locked: (seconds: number) => string;
  },
): string {
  switch (failure.reason) {
    case 'locked':
      return messages.locked(failure.retryAfterSeconds);
    case 'unavailable':
      return messages.unavailable;
    case 'network':
      return messages.network;
    default:
      // 'rejected' and 'cancelled'. A cancellation never reaches here — the
      // caller returns to the prompt instead — but the exhaustive default
      // keeps this total.
      return messages.rejected;
  }
}
