/**
 * Security utilities for /api/local-op/* endpoints.
 *
 * All local-op endpoints enforce:
 * 1. Loopback-only — reject remote addresses
 * 2. Origin header check — only localhost/127.0.0.1/[::1]
 * 3. --dir confined to user's home dir (no path traversal)
 * 4. URL protocol allowlist (https/ssh/git/SCP; block file/javascript/ext::)
 * 5. Concurrency=1 per endpoint (see ConcurrencyGuard)
 * 6. 10-min subprocess wall-clock timeout (enforced by callers)
 * 7. Argv-array spawn — no shell interpolation (enforced by callers)
 */

import { lstatSync, realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { AccessPolicy, AccessPrincipal } from './access-control.ts';
import { errorResponse } from './http/error-response.ts';

// ─── Protocol checks ─────────────────────────────────────────────────────────

const ALLOWED_URL_PATTERNS: RegExp[] = [
  /^https?:\/\//i,
  /^ssh:\/\//i,
  /^git:\/\//i,
  /^git@[^:]+:/, // SCP-style: git@github.com:owner/repo
];

const BLOCKED_URL_PATTERNS: RegExp[] = [
  /^file:\/\//i,
  /^javascript:/i,
  /^ext::/i,
  /^data:/i,
  /^vbscript:/i,
];

/**
 * Returns true if the URL uses an allowed git-transport protocol.
 * Rejects file://, javascript:, ext::, data:, and vbscript: explicitly.
 */
export function isAllowedGitUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (BLOCKED_URL_PATTERNS.some((p) => p.test(url))) return false;
  return ALLOWED_URL_PATTERNS.some((p) => p.test(url));
}

// ─── Path safety ─────────────────────────────────────────────────────────────

/** Expand a leading `~` or `~/` to the user's home directory. */
export function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Walk from `start`'s parent up to (but not including) `root` and return true
 * if any ancestor component is a symbolic link. Used to close a security gap
 * in the EPERM accept-branch of `isPathWithinHome`: `lstat` follows symlinks
 * in ancestor components and only reports `isSymbolicLink()` for the leaf, so
 * a non-symlink leaf may sit under a symlinked ancestor that redirects
 * off-home. The accept-branch runs only on the rare TCC-class denial path,
 * so the per-component cost is bounded.
 *
 * Fails closed: if any `lstat` along the chain throws, treats it as a symlink
 * (return true) — we have no basis to attest the component is safe.
 */
function ancestorChainHasSymlink(start: string, root: string): boolean {
  let cursor = dirname(start);
  while (cursor !== root && cursor !== dirname(cursor)) {
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(cursor);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      console.warn(
        `[local-op-security] ancestorChainHasSymlink: lstat failed on ${cursor} (${code ?? 'unknown'}); treating as symlink (fail-closed)`,
      );
      return true;
    }
    if (stats.isSymbolicLink()) {
      console.warn(`[local-op-security] ancestorChainHasSymlink: symlink detected at ${cursor}`);
      return true;
    }
    cursor = dirname(cursor);
  }
  return false;
}

/**
 * Internal: realpath-based containment check, parameterized on `home` so tests
 * can exercise symlink scenarios without touching the developer's actual home.
 */
export function isPathWithinHome(dirPath: string, home: string): boolean {
  if (!dirPath || typeof dirPath !== 'string') return false;
  if (dirPath.includes('\0')) return false;

  let realHome: string;
  try {
    realHome = realpathSync(home);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    console.warn(
      `[local-op-security] realpath failed on home dir ${home} (${code ?? 'unknown'}); rejecting all paths`,
    );
    return false;
  }

  const lexicalAbs = resolve(expandTilde(dirPath));

  const suffix: string[] = [];
  let current = lexicalAbs;
  while (true) {
    let stats: ReturnType<typeof lstatSync> | null = null;
    try {
      stats = lstatSync(current);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(
          `[local-op-security] lstat error at ${current} (${code ?? 'unknown'}); rejecting`,
        );
        return false;
      }
    }

    if (stats !== null) {
      // `lstat` follows symlinks in ancestor components and only reports
      // `isSymbolicLink()` for the leaf, so even a non-symlink leaf may sit
      // under a symlinked ancestor that redirects off-home. `realpath` is
      // normally required to canonicalize. The exception is TCC-class denial
      // on macOS (Files-and-Folders gating): when `lstat` confirms the leaf
      // is not a symlink AND `realpath` returns EPERM/EACCES, the per-binary
      // realpath denial isn't a corruption signal — but the leaf attestation
      // only covers the leaf, not the ancestor chain `lstat` silently
      // followed. An explicit `ancestorChainHasSymlink` scan covers that gap
      // before the lexical path is trusted.
      let resolvedCurrent: string;
      try {
        resolvedCurrent = realpathSync(current);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (stats.isSymbolicLink()) {
          console.warn(
            `[local-op-security] realpath failed on symlink leaf at ${current} (${code ?? 'unknown'}); rejecting`,
          );
          return false;
        }
        if (code === 'EPERM' || code === 'EACCES') {
          if (ancestorChainHasSymlink(current, home)) {
            console.warn(
              `[local-op-security] EPERM accept-branch refused at ${current}: symlinked ancestor in chain; rejecting`,
            );
            return false;
          }
          console.warn(
            `[local-op-security] realpath denied on non-symlink leaf at ${current} (${code ?? 'unknown'}); trusting lexical path (TCC-class)`,
          );
          resolvedCurrent = current;
        } else {
          console.warn(
            `[local-op-security] realpath failed on non-symlink leaf at ${current} (${code ?? 'unknown'}); rejecting`,
          );
          return false;
        }
      }
      const canonical = suffix.length === 0 ? resolvedCurrent : join(resolvedCurrent, ...suffix);
      const rel = relative(realHome, canonical);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    }

    const parent = dirname(current);
    if (parent === current) return false;
    suffix.unshift(basename(current));
    current = parent;
  }
}

/**
 * Returns true if `dirPath` is within the user's home directory and contains
 * no null bytes. Resolves relative paths against cwd, expands tildes, and
 * canonicalizes via `realpath` so a pre-existing symlink anywhere on the
 * path cannot escape the gate (e.g. `~/decoy` → `/etc`, or a symlinked
 * ancestor with a real subdir below it).
 *
 * Path components that don't yet exist (the common case for clone targets)
 * cannot themselves be symlinks, so the algorithm walks up to the deepest
 * existing ancestor, canonicalizes that, and re-appends the missing suffix.
 * A broken symlink (exists as link, target gone) anywhere on the path fails
 * closed — its target is unverifiable.
 *
 * On macOS, a TCC-protected non-symlink directory may grant `lstat` but deny
 * `realpath` with EPERM/EACCES. In that specific case (lstat confirms the
 * leaf is not a symlink AND `realpath` returns EPERM/EACCES) the lexical
 * path is trusted at that component — the kernel has already attested the
 * leaf is not a redirector. Symlink leaves still fail closed on any
 * `realpath` error.
 *
 * The home-dir confinement prevents the local-op relay from being used to
 * spawn servers or clones at arbitrary system paths (e.g. /etc, /root).
 */
export function isSafeLocalPath(dirPath: string): boolean {
  return isPathWithinHome(dirPath, homedir());
}

// ─── Request security checks ─────────────────────────────────────────────────

/**
 * Returns true if the request comes from a loopback address.
 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * Returns true if the Origin header (when present) is a loopback origin.
 * Absent Origin header is allowed (same-origin browser requests / CLI tools).
 *
 * Parses the URL and compares hostname exactly; a raw `startsWith` would
 * accept crafted origins like `http://127.0.0.1.evil.com` if DNS rebinding
 * ever lined up with the loopback socket check.
 */
export function hasValidLocalOpOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    // WHATWG URL preserves the IPv6 brackets in `hostname` (e.g. `[::1]`), so
    // the comparison set includes the bracketed form alongside the literal.
    const { hostname } = new URL(origin);
    return (
      hostname === '127.0.0.1' ||
      hostname === 'localhost' ||
      hostname === '[::1]' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}

/**
 * What a `local-op` endpoint allows under a `remote` access policy.
 *
 * Every call site states one. There is no default: a new endpoint that forgets
 * to choose fails to compile, which is the only reliable way to keep 28 call
 * sites honest.
 */
export type LocalOpRemoteRule =
  /**
   * Refused to every remote caller. For endpoints whose effect is on the
   * machine the server runs on rather than on the workspace — spawning a local
   * editor, replacing the server's GitHub credential, writing a machine-global
   * API key.
   */
  | 'never'
  /**
   * Admitted for an operator who signed in with a password or a passkey.
   *
   * Not for an access token: a token is a delegated machine credential handed
   * to an MCP client or a script, and those are authorized to read and write
   * documents, not to drive the operator's git and GitHub credentials.
   */
  | 'account-session';

export interface LocalOpGateOptions {
  /** Route-name tag for the `ok.api.error.count{handler}` counter. */
  readonly handler: string;
  readonly policy: AccessPolicy;
  /**
   * Who the admission gate decided this caller is. Undefined under a `local`
   * policy, where admission is by reachability and there is no principal to
   * speak of.
   */
  readonly principal: AccessPrincipal | undefined;
  readonly remote: LocalOpRemoteRule;
}

/**
 * The gate in front of every `local-op` endpoint. Emits an RFC 9457 403 and
 * returns false when the request is refused.
 *
 * ## Why the rule differs by policy
 *
 * Under a `local` policy the checks are network-level: a loopback socket and a
 * loopback `Origin`. That is the DNS-rebinding defense the desktop app and the
 * CLI have always run behind, and it is left exactly as it was.
 *
 * Under a `remote` policy both of those checks are worthless, and worse than
 * worthless — they refuse the legitimate browser while admitting a script:
 *
 * - The socket check always passes. Behind a reverse proxy the TCP peer is the
 *   proxy on loopback, and `isLoopbackRequest` reads the socket rather than the
 *   forwarded address. So "loopback-required" is not true of anything it lets
 *   through.
 * - The origin check passes when the header is absent, which is exactly the
 *   case for a non-browser client. A browser at the public origin sends its
 *   real `Origin` and is refused; `curl` sends none and is admitted.
 *
 * So the remote branch drops both and asks the question that actually
 * separates the operator from everyone else: did a person sign in? Cross-site
 * request forgery stays closed by `SameSite=Lax` on the session cookie, which
 * is the same reasoning `authorizeOrigin` in `access-control.ts` already
 * records for the admission gate.
 */
export function checkLocalOpSecurity(
  req: IncomingMessage,
  res: ServerResponse,
  options: LocalOpGateOptions,
): boolean {
  if (options.policy.mode === 'remote') {
    if (options.remote === 'account-session' && options.principal?.kind === 'account-session') {
      return true;
    }
    errorResponse(
      res,
      403,
      'urn:ok:error:desktop-only',
      'This endpoint is not available over a remote connection.',
      {
        handler: options.handler,
        detail:
          options.remote === 'never'
            ? 'This action runs on the machine the server is installed on. Use the desktop app.'
            : 'Sign in with your account to use this action.',
      },
    );
    return false;
  }

  if (!isLoopbackRequest(req)) {
    errorResponse(
      res,
      403,
      'urn:ok:error:loopback-required',
      'Local-op endpoints require a loopback connection.',
      { handler: options.handler },
    );
    return false;
  }
  if (!hasValidLocalOpOrigin(req)) {
    errorResponse(
      res,
      403,
      'urn:ok:error:invalid-origin',
      'Origin header is not a permitted loopback origin.',
      { handler: options.handler },
    );
    return false;
  }
  return true;
}

// ─── Concurrency guard (1 in-flight per endpoint) ────────────────────────────

/**
 * Simple per-key mutex: allows at most one in-flight request per endpoint path.
 * Returns a 429 if a second request arrives while the first is still active.
 *
 * Usage:
 *   const guard = createConcurrencyGuard();
 *   if (!guard.tryAcquire('/api/local-op/clone')) { /* already in flight *\/ }
 *   try { … } finally { guard.release('/api/local-op/clone'); }
 */
interface ConcurrencyGuard {
  tryAcquire(key: string): boolean;
  release(key: string): void;
}

export function createConcurrencyGuard(): ConcurrencyGuard {
  const inFlight = new Set<string>();
  return {
    tryAcquire(key: string): boolean {
      if (inFlight.has(key)) return false;
      inFlight.add(key);
      return true;
    },
    release(key: string): void {
      inFlight.delete(key);
    },
  };
}
